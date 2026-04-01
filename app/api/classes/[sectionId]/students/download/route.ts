import * as XLSXStyle from "xlsx-js-style";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
const _GET = async function(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });


  // Fetch section with grade level, school year, and adviser in one query
  const { data: sectionRaw, error: secError } = await admin
    .from("sections")
    .select(
      "section_id, name, sy_id, grade_levels(display_name), users(first_name, last_name), school_years(year_range)",
    )
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (secError)
    return Response.json({ error: "Internal server error." }, { status: 500 });
  if (!sectionRaw)
    return Response.json({ error: "Section not found." }, { status: 404 });

  const sec = sectionRaw as any;

  const glRaw = sec.grade_levels;
  const gradeLevel: string = Array.isArray(glRaw)
    ? (glRaw[0]?.display_name ?? "")
    : (glRaw?.display_name ?? "");

  const syRaw = sec.school_years;
  const schoolYear: string = Array.isArray(syRaw)
    ? (syRaw[0]?.year_range ?? "")
    : (syRaw?.year_range ?? "");

  const adviserRaw = Array.isArray(sec.users) ? sec.users[0] : sec.users;
  const adviserName = adviserRaw
    ? [adviserRaw.last_name, adviserRaw.first_name].filter(Boolean).join(", ")
    : "";

  // Fetch enrolled students
  const { data: enrollData, error: enrollErr } = await admin
    .from("enrollments")
    .select("lrn, students!inner(full_name, sex)")
    .eq("section_id", sectionId)
    .eq("sy_id", sec.sy_id)
    .is("deleted_at", null)
    .is("students.deleted_at", null);

  if (enrollErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const allStudents = ((enrollData ?? []) as any[]).map((e: any) => {
    const st = Array.isArray(e.students) ? e.students[0] : e.students;
    return {
      lrn: e.lrn as string,
      full_name: (st?.full_name ?? "") as string,
      sex: (st?.sex ?? "M") as "M" | "F",
    };
  });

  // Males first (alphabetical), then females (alphabetical)
  const males = allStudents
    .filter((s) => s.sex === "M")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const females = allStudents
    .filter((s) => s.sex === "F")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  // ── Build Excel ────────────────────────────────────────────────────────────

  const wb = XLSXStyle.utils.book_new();
  const ws: XLSXStyle.WorkSheet = {};

  const thin = { style: "thin", color: { rgb: "000000" } };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
  const centerMid = { horizontal: "center", vertical: "center" };
  const leftMid = { horizontal: "left", vertical: "center" };

  const labelFont = { name: "Sans Serif", sz: 12, bold: true };
  const valueFont = { name: "Sans Serif", sz: 12 };
  const headerFont = { name: "Sans Serif", sz: 11, bold: true };
  const dataFont = { name: "Sans Serif", sz: 11 };
  const groupHeaderFont = { name: "Sans Serif", sz: 11, bold: true };
  const groupFill = { patternType: "solid", fgColor: { rgb: "E9ECEF" } };

  // Column widths
  ws["!cols"] = [
    { wch: 18.71 }, // A
    { wch: 35 },    // B
    { wch: 24 },    // C
    { wch: 18.71 }, // D
    { wch: 24.71 }, // E
    { wch: 18.71 }, // F
    { wch: 14.29 }, // G
    { wch: 36 },    // H
  ];

  const wsRows: XLSXStyle.RowInfo[] = [];
  wsRows[0] = { hpt: 37.5 };  // Row 1: title
  wsRows[1] = { hpt: 24.95 }; // Row 2: spacer
  wsRows[2] = { hpt: 24 };    // Row 3: metadata
  wsRows[3] = { hpt: 24.95 }; // Row 4: spacer
  wsRows[4] = { hpt: 50.25 }; // Row 5: column headers

  const merges: XLSXStyle.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // A1:H1
    { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }, // D3:E3
    { s: { r: 2, c: 6 }, e: { r: 2, c: 7 } }, // G3:H3
  ];

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws["A1"] = {
    v: "E-Class Record", t: "s",
    s: { font: { name: "Sans Serif", sz: 21, bold: true }, alignment: centerMid },
  };

  // ── Row 3: Metadata ───────────────────────────────────────────────────────
  ws["A3"] = { v: "School Year:", t: "s", s: { font: labelFont, alignment: leftMid, border: allBorders } };
  ws["B3"] = { v: schoolYear, t: "s", s: { font: valueFont, alignment: centerMid, border: allBorders } };
  ws["C3"] = { v: "Grade & Section:", t: "s", s: { font: labelFont, alignment: leftMid, border: allBorders } };
  ws["D3"] = { v: `${gradeLevel} - ${sec.name}`, t: "s", s: { font: valueFont, alignment: centerMid, border: allBorders } };
  ws["E3"] = { v: "", t: "s", s: { border: allBorders } };
  ws["F3"] = { v: "Adviser:", t: "s", s: { font: labelFont, alignment: leftMid, border: allBorders } };
  ws["G3"] = { v: adviserName, t: "s", s: { font: valueFont, alignment: centerMid, border: allBorders } };
  ws["H3"] = { v: "", t: "s", s: { border: allBorders } };

  // ── Row 5: Column headers ─────────────────────────────────────────────────
  ws["A5"] = { v: "LRN", t: "s", s: { font: headerFont, alignment: centerMid, border: allBorders } };
  ws["B5"] = { v: "NAME (Last Name, First Name, Middle Name)", t: "s", s: { font: headerFont, alignment: { ...centerMid, wrapText: true }, border: allBorders } };
  ws["C5"] = { v: "Sex (M/F)", t: "s", s: { font: headerFont, alignment: centerMid, border: allBorders } };

  // ── Rows 6+: Group headers + student data ────────────────────────────────
  let currentRowIdx = 5; // 0-indexed; rowIdx=5 → Excel row 6

  function addGroupHeader(rowIdx: number, label: string) {
    const rowRef = rowIdx + 1;
    ws[`A${rowRef}`] = { v: label, t: "s", s: { font: groupHeaderFont, alignment: centerMid, fill: groupFill, border: allBorders } };
    ws[`B${rowRef}`] = { v: "", t: "s", s: { fill: groupFill, border: allBorders } };
    ws[`C${rowRef}`] = { v: "", t: "s", s: { fill: groupFill, border: allBorders } };
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    wsRows[rowIdx] = { hpt: 18 };
  }

  function addStudentRow(rowIdx: number, student: { lrn: string; full_name: string; sex: string }) {
    const rowRef = rowIdx + 1;
    ws[`A${rowRef}`] = {
      v: student.lrn, t: "s", z: "@",
      s: { font: dataFont, alignment: { vertical: "center" }, border: allBorders },
    };
    ws[`B${rowRef}`] = {
      v: student.full_name.toUpperCase(), t: "s",
      s: { font: dataFont, alignment: { vertical: "center" }, border: allBorders },
    };
    ws[`C${rowRef}`] = {
      v: student.sex, t: "s",
      s: { font: dataFont, alignment: centerMid, border: allBorders },
    };
    wsRows[rowIdx] = { hpt: 18 };
  }

  if (males.length > 0) {
    addGroupHeader(currentRowIdx, `Male (${males.length})`);
    currentRowIdx++;
    for (const student of males) {
      addStudentRow(currentRowIdx, student);
      currentRowIdx++;
    }
  }

  if (females.length > 0) {
    addGroupHeader(currentRowIdx, `Female (${females.length})`);
    currentRowIdx++;
    for (const student of females) {
      addStudentRow(currentRowIdx, student);
      currentRowIdx++;
    }
  }

  ws["!rows"] = wsRows;
  ws["!merges"] = merges;
  ws["!ref"] = `A1:H${currentRowIdx}`;
  ws["!pageSetup"] = { paperSize: 9, orientation: "portrait" } as any;
  ws["!margins"] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

  XLSXStyle.utils.book_append_sheet(wb, ws, "Roster");
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeName = `${gradeLevel} - ${sec.name} Roster.xlsx`.replace(
    /[<>:"/\\|?*]/g,
    "_",
  );

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}

export const GET = withErrorHandler(_GET)
