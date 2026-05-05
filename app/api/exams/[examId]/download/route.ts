import * as XLSXStyle from "xlsx-js-style";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

type ScoreRow = {
  enrollment_id: number;
  exam_assignment_id: number;
  calculated_score: number | null;
  graded_at: string | null;
};

function getProficiency(percent: number): string {
  if (percent >= 90) return "Highly Proficient";
  if (percent >= 75) return "Proficient";
  if (percent >= 50) return "Nearly Proficient";
  if (percent >= 25) return "Low Proficient";
  return "Not Proficient";
}

const _GET = async function (
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("exams.full_access") ||
    permissions.includes("exams.limited_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { examId: examIdRaw } = await params;
  const examId = Number(examIdRaw);
  if (!examId || Number.isNaN(examId))
    return Response.json({ error: "Invalid exam ID." }, { status: 400 });

  // ── Fetch the logged-in user's display name ────────────────────────────────
  const { data: userRow } = await admin
    .from("users")
    .select("first_name, last_name")
    .eq("uid", user.id)
    .maybeSingle();
  const generatedBy = userRow
    ? [userRow.last_name, userRow.first_name].filter(Boolean).join(", ")
    : "Unknown";

  // ── Fetch exam with subject + quarter ──────────────────────────────────────
  const { data: examRaw, error: examError } = await admin
    .from("exams")
    .select(
      "exam_id, title, total_items, exam_date, curriculum_subjects(subjects(name)), quarters(name)",
    )
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .maybeSingle();

  if (examError)
    return Response.json({ error: "Internal server error." }, { status: 500 });
  if (!examRaw)
    return Response.json({ error: "Exam not found." }, { status: 404 });

  const exam = examRaw as any;
  const subjectRaw = exam.curriculum_subjects;
  const subjectName: string = Array.isArray(subjectRaw)
    ? (subjectRaw[0]?.subjects?.name ?? "—")
    : (subjectRaw?.subjects?.name ?? "—");
  const quarterRaw = exam.quarters;
  const quarterName: string = Array.isArray(quarterRaw)
    ? (quarterRaw[0]?.name ?? "—")
    : (quarterRaw?.name ?? "—");
  const totalItems: number = exam.total_items ?? 0;
  const examDate: string = exam.exam_date ?? "—";

  // ── Fetch assignments with section + grade level ───────────────────────────
  const { data: assignments, error: assignmentError } = await admin
    .from("exam_assignments")
    .select("id, section_id, sections(name, grade_levels(display_name))")
    .eq("exam_id", examId);

  if (assignmentError)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const sectionIds = (assignments ?? []).map((a: any) => a.section_id);
  const assignmentBySection = new Map<number, number>();
  for (const row of (assignments ?? []) as any[])
    assignmentBySection.set(row.section_id, row.id);

  const sectionNames = Array.from(
    new Set(
      ((assignments ?? []) as any[]).map((a) => {
        const sec = Array.isArray(a.sections) ? a.sections[0] : a.sections;
        const gl = Array.isArray(sec?.grade_levels)
          ? sec.grade_levels[0]
          : sec?.grade_levels;
        const glName = gl?.display_name ?? "";
        const secName = sec?.name ?? "";
        return glName && secName ? `${glName} - ${secName}` : secName || glName;
      }),
    ),
  ).join(", ");

  // ── Fetch enrollments ──────────────────────────────────────────────────────
  if (sectionIds.length === 0) {
    return buildXlsx(exam.title, subjectName, quarterName, sectionNames, examDate, totalItems, generatedBy, [], []);
  }

  const { data: enrollments, error: enrollmentError } = await admin
    .from("enrollments")
    .select("enrollment_id, lrn, section_id, students!inner(full_name, sex)")
    .in("section_id", sectionIds)
    .is("deleted_at", null)
    .is("students.deleted_at", null);

  if (enrollmentError)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  // ── Fetch scores ───────────────────────────────────────────────────────────
  const assignmentIds = (assignments ?? []).map((a: any) => a.id);
  const { data: scoreRowsRaw, error: scoreError } = await admin
    .from("scores")
    .select("enrollment_id, exam_assignment_id, calculated_score, graded_at")
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false });
  const scoreRows = (scoreRowsRaw ?? []) as ScoreRow[];

  if (scoreError)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const latestScore = new Map<number, ScoreRow>();
  for (const row of scoreRows)
    if (!latestScore.has(row.enrollment_id)) latestScore.set(row.enrollment_id, row);

  const students = ((enrollments ?? []) as any[]).map((row) => {
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    const assignmentId = assignmentBySection.get(row.section_id);
    const latest = latestScore.get(row.enrollment_id);
    const score =
      latest && assignmentId && latest.exam_assignment_id === assignmentId
        ? (latest.calculated_score ?? null)
        : null;
    return {
      lrn: row.lrn ?? "",
      full_name: student?.full_name ?? "",
      sex: (student?.sex ?? "M") as "M" | "F",
      score,
    };
  });

  const males = students
    .filter((s) => s.sex === "M")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const females = students
    .filter((s) => s.sex === "F")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return buildXlsx(exam.title, subjectName, quarterName, sectionNames, examDate, totalItems, generatedBy, males, females);
};

// ── Excel builder ────────────────────────────────────────────────────────────

type StudentEntry = { lrn: string; full_name: string; sex: string; score: number | null };

function buildXlsx(
  examTitle: string,
  subjectName: string,
  quarterName: string,
  sectionNames: string,
  examDate: string,
  totalItems: number,
  generatedBy: string,
  males: StudentEntry[],
  females: StudentEntry[],
): Response {
  const wb = XLSXStyle.utils.book_new();
  const ws: XLSXStyle.WorkSheet = {};

  // ── Shared styles (mirrors the roster route) ─────────────────────────────
  const thin = { style: "thin", color: { rgb: "000000" } };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
  const centerMid = { horizontal: "center", vertical: "center" };
  const leftMid   = { horizontal: "left",   vertical: "center" };
  const labelFont = { name: "Sans Serif", sz: 12, bold: true };
  const valueFont = { name: "Sans Serif", sz: 12 };
  const headerFont = { name: "Sans Serif", sz: 11, bold: true };
  const dataFont   = { name: "Sans Serif", sz: 11 };
  const groupHeaderFont = { name: "Sans Serif", sz: 11, bold: true };
  const groupFill = { patternType: "solid", fgColor: { rgb: "E9ECEF" } };

  // 8 columns — A-E are data columns; F-H carry metadata labels/values only
  ws["!cols"] = [
    { wch: 18.71 }, // A: LRN
    { wch: 35 },    // B: Name
    { wch: 10 },    // C: Sex
    { wch: 15 },    // D: Score
    { wch: 22 },    // E: Level of Proficiency
    { wch: 14.29 }, // F: (metadata spacer)
    { wch: 18.71 }, // G: (metadata label)
    { wch: 22 },    // H: (metadata value)
  ];

  const wsRows: XLSXStyle.RowInfo[] = [];
  wsRows[0] = { hpt: 37.5 };  // Row 1 — title
  wsRows[1] = { hpt: 24.95 }; // Row 2 — spacer
  wsRows[2] = { hpt: 24 };    // Row 3 — metadata 1
  wsRows[3] = { hpt: 24 };    // Row 4 — metadata 2
  wsRows[4] = { hpt: 24 };    // Row 5 — metadata 3 (generated by)
  wsRows[5] = { hpt: 24.95 }; // Row 6 — spacer
  wsRows[6] = { hpt: 50.25 }; // Row 7 — column headers

  const merges: XLSXStyle.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // A1:H1  title
    { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }, // B3:C3  exam title value
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } }, // E3:F3  section value
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } }, // B4:C4  subject value
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } }, // E4:F4  exam date value
    { s: { r: 4, c: 1 }, e: { r: 4, c: 7 } }, // B5:H5  generated by value
  ];

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws["A1"] = {
    v: "Examination Results", t: "s",
    s: { font: { name: "Sans Serif", sz: 21, bold: true }, alignment: centerMid },
  };

  // ── Row 3: Exam Title | Section | Quarter ─────────────────────────────────
  ws["A3"] = { v: "Exam Title:", t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["B3"] = { v: examTitle,    t: "s", s: { font: valueFont, alignment: centerMid,  border: allBorders } };
  ws["C3"] = { v: "",           t: "s", s: {                                          border: allBorders } };
  ws["D3"] = { v: "Section:",   t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["E3"] = { v: sectionNames, t: "s", s: { font: valueFont, alignment: centerMid,  border: allBorders } };
  ws["F3"] = { v: "",           t: "s", s: {                                          border: allBorders } };
  ws["G3"] = { v: "Quarter:",   t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["H3"] = { v: quarterName,  t: "s", s: { font: valueFont, alignment: centerMid,  border: allBorders } };

  // ── Row 4: Subject | Exam Date | Total Items ──────────────────────────────
  ws["A4"] = { v: "Subject:",      t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["B4"] = { v: subjectName,     t: "s", s: { font: valueFont, alignment: centerMid,  border: allBorders } };
  ws["C4"] = { v: "",              t: "s", s: {                                          border: allBorders } };
  ws["D4"] = { v: "Exam Date:",    t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["E4"] = { v: examDate,        t: "s", s: { font: valueFont, alignment: centerMid,  border: allBorders } };
  ws["F4"] = { v: "",              t: "s", s: {                                          border: allBorders } };
  ws["G4"] = { v: "Total Items:",  t: "s", s: { font: labelFont, alignment: leftMid,   border: allBorders } };
  ws["H4"] = { v: totalItems,      t: "n", s: { font: valueFont, alignment: centerMid,  border: allBorders } };

  // ── Row 5: Generated by ───────────────────────────────────────────────────
  ws["A5"] = { v: "Generated by:", t: "s", s: { font: labelFont, alignment: leftMid,  border: allBorders } };
  ws["B5"] = { v: generatedBy,     t: "s", s: { font: valueFont, alignment: centerMid, border: allBorders } };
  for (const col of ["C", "D", "E", "F", "G", "H"] as const)
    ws[`${col}5`] = { v: "", t: "s", s: { border: allBorders } };

  // ── Row 7: Column headers ─────────────────────────────────────────────────
  ws["A7"] = { v: "LRN",                                       t: "s", s: { font: headerFont, alignment: centerMid,                     border: allBorders } };
  ws["B7"] = { v: "NAME (Last Name, First Name, Middle Name)", t: "s", s: { font: headerFont, alignment: { ...centerMid, wrapText: true }, border: allBorders } };
  ws["C7"] = { v: "Sex (M/F)",                                 t: "s", s: { font: headerFont, alignment: centerMid,                     border: allBorders } };
  ws["D7"] = { v: "Score",                                     t: "s", s: { font: headerFont, alignment: centerMid,                     border: allBorders } };
  ws["E7"] = { v: "Level of Proficiency",                      t: "s", s: { font: headerFont, alignment: { ...centerMid, wrapText: true }, border: allBorders } };

  // ── Data rows ─────────────────────────────────────────────────────────────
  let rowIdx = 7; // 0-based; rowIdx 7 = Excel row 8

  function addGroupHeader(label: string) {
    const ref = rowIdx + 1;
    for (const col of ["A", "B", "C", "D", "E"] as const)
      ws[`${col}${ref}`] = { v: col === "A" ? label : "", t: "s", s: { font: groupHeaderFont, alignment: centerMid, fill: groupFill, border: allBorders } };
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 4 } });
    wsRows[rowIdx] = { hpt: 18 };
    rowIdx++;
  }

  function addStudentRow(student: StudentEntry) {
    const ref = rowIdx + 1;
    const percent =
      student.score != null && totalItems > 0
        ? Math.round((student.score / totalItems) * 100)
        : null;
    const proficiency = percent != null ? getProficiency(percent) : "";
    const scoreDisplay = student.score != null ? `${student.score} / ${totalItems}` : "";

    ws[`A${ref}`] = { v: student.lrn,                    t: "s", z: "@", s: { font: dataFont, alignment: { vertical: "center" }, border: allBorders } };
    ws[`B${ref}`] = { v: student.full_name.toUpperCase(), t: "s",         s: { font: dataFont, alignment: { vertical: "center" }, border: allBorders } };
    ws[`C${ref}`] = { v: student.sex,                    t: "s",         s: { font: dataFont, alignment: centerMid,              border: allBorders } };
    ws[`D${ref}`] = { v: scoreDisplay,                   t: "s",         s: { font: dataFont, alignment: centerMid,              border: allBorders } };
    ws[`E${ref}`] = { v: proficiency,                    t: "s",         s: { font: dataFont, alignment: { vertical: "center" }, border: allBorders } };
    wsRows[rowIdx] = { hpt: 18 };
    rowIdx++;
  }

  if (males.length > 0) {
    addGroupHeader(`Male (${males.length})`);
    for (const s of males) addStudentRow(s);
  }
  if (females.length > 0) {
    addGroupHeader(`Female (${females.length})`);
    for (const s of females) addStudentRow(s);
  }

  ws["!rows"]     = wsRows;
  ws["!merges"]   = merges;
  ws["!ref"]      = `A1:H${rowIdx}`;
  ws["!pageSetup"]  = { paperSize: 9, orientation: "landscape" } as any;
  ws["!margins"]  = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

  XLSXStyle.utils.book_append_sheet(wb, ws, "Results");
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeTitle = examTitle.replace(/[<>:"/\\|?*]/g, "_");
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeTitle}_Results.xlsx"`,
    },
  });
}

export const GET = withErrorHandler(_GET);
