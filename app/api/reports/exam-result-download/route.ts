import * as XLSXStyle from "xlsx-js-style";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { fetchMyAssignedScope } from "@/lib/services/reportsAnalysisService";

type MaybeArray<T> = T | T[] | null;
type Worksheet = XLSXStyle.WorkSheet & {
  "!pageSetup"?: { paperSize: number; orientation: "landscape" | "portrait" };
  "!margins"?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    header: number;
    footer: number;
  };
};

type ReportRow = {
  exam_id: number | null;
  section_id: number | null;
  curriculum_subject_id: number | null;
  grade_level_id: number | null;
  quarter_id: number | null;
  total_items: number | null;
  total_cases: number | null;
  total_score: number | null;
  mean: number | null;
  pl: number | null;
  highest_score: number | null;
  lowest_score: number | null;
  mps: number | null;
  total_achieved: number | null;
  student_scores: unknown;
};

type StudentScore = {
  enrollment_id?: number | null;
  enrollmentId?: number | null;
  student_name?: string | null;
  pupilName?: string | null;
  score?: number | null;
  testScore?: number | null;
  total_items?: number | null;
  totalItems?: number | null;
  mpl?: number | null;
  proficiency_level?: string | null;
  proficiencyLevel?: string | null;
  sex?: string | null;
};

type ProficiencyRow = {
  pupilName: string;
  testScore: number;
  totalItems: number;
  mpl: number;
  proficiencyLevel: string;
  sex: "Male" | "Female";
};

type ExamRow = {
  exam_id: number;
  title: string;
  total_items: number | null;
  exam_date: string | null;
  quarters?: MaybeArray<{ name?: string | null }>;
  curriculum_subjects?: MaybeArray<{
    subject_id?: number | null;
    subjects?: MaybeArray<{ name?: string | null; subject_type?: "BOTH" | "SSES" | null }>;
  }>;
};

type SectionRow = {
  section_id: number;
  name: string | null;
  grade_levels?: MaybeArray<{ display_name?: string | null; level_number?: number | null }>;
};

type TeacherAssignmentRow = {
  users?: MaybeArray<{ first_name?: string | null; last_name?: string | null }>;
};

const MPL_THRESHOLD = 60;
const PROFICIENCY_LEVELS = [
  "Highly Proficient",
  "Proficient",
  "Nearly Proficient",
  "Low Proficient",
  "Not Proficient",
] as const;

function firstJoin<T>(value: MaybeArray<T> | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSex(value: string | null | undefined): "Male" | "Female" | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "m" || raw === "male" || raw.startsWith("male")) return "Male";
  if (raw === "f" || raw === "female" || raw.startsWith("female")) return "Female";
  return null;
}

function getProficiencyFromMpl(mpl: number): string {
  if (mpl >= 90) return "Highly Proficient";
  if (mpl >= 75) return "Proficient";
  if (mpl >= 50) return "Nearly Proficient";
  if (mpl >= 25) return "Low Proficient";
  return "Not Proficient";
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function teacherName(row: TeacherAssignmentRow | null): string {
  const user = firstJoin(row?.users);
  const name = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  return name || "Unassigned";
}

function parseProficiencyRows(report: ReportRow): ProficiencyRow[] {
  const scores = Array.isArray(report.student_scores)
    ? (report.student_scores as StudentScore[])
    : [];

  return scores
    .map((score) => {
      const name =
        score.student_name?.trim() ||
        score.pupilName?.trim() ||
        `Enrollment #${score.enrollment_id ?? score.enrollmentId ?? "-"}`;
      const mpl = toFiniteNumber(score.mpl);
      return {
        pupilName: name,
        testScore: toFiniteNumber(score.score ?? score.testScore),
        totalItems: toFiniteNumber(score.total_items ?? score.totalItems ?? report.total_items),
        mpl,
        proficiencyLevel:
          score.proficiency_level?.trim() ||
          score.proficiencyLevel?.trim() ||
          getProficiencyFromMpl(mpl),
        sex: normalizeSex(score.sex) ?? "Male",
      };
    })
    .sort((a, b) => a.pupilName.localeCompare(b.pupilName, undefined, { sensitivity: "base" }));
}

function canAccessReport({
  permissions,
  userId,
  report,
  scope,
}: {
  permissions: string[];
  userId: string;
  report: ReportRow;
  scope: Awaited<ReturnType<typeof fetchMyAssignedScope>>;
}): boolean {
  if (permissions.includes("reports.view_all")) {
    return true;
  }
  const sectionId = report.section_id;
  const curriculumSubjectId = report.curriculum_subject_id;
  if (sectionId == null || curriculumSubjectId == null) return false;
  if (
    permissions.includes("reports.view_assigned") &&
    scope.assignedPairs.some(
      (pair) => pair.sectionId === sectionId && pair.curriculumSubjectId === curriculumSubjectId,
    )
  ) {
    return true;
  }
  if (
    permissions.includes("reports.monitor_grade_level") &&
    scope.glSectionIds.includes(sectionId) &&
    scope.curriculumSubjectIds.includes(curriculumSubjectId)
  ) {
    return true;
  }
  if (
    permissions.includes("reports.monitor_subjects") &&
    scope.subjectSectionIds.includes(sectionId) &&
    scope.curriculumSubjectIds.includes(curriculumSubjectId)
  ) {
    return true;
  }
  return Boolean(userId && false);
}

const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const examId = Number(url.searchParams.get("examId"));
  const sectionId = Number(url.searchParams.get("sectionId"));
  if (!Number.isFinite(examId) || !Number.isFinite(sectionId)) {
    return Response.json({ error: "Invalid exam or section." }, { status: 400 });
  }

  const { data: reportData, error: reportError } = await adminClient
    .from("exam_results_reports")
    .select(
      "exam_id, section_id, curriculum_subject_id, grade_level_id, quarter_id, total_items, total_cases, total_score, mean, pl, highest_score, lowest_score, mps, total_achieved, student_scores",
    )
    .eq("exam_id", examId)
    .eq("section_id", sectionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reportError) {
    return Response.json({ error: "Failed to load saved report." }, { status: 500 });
  }
  const report = reportData as ReportRow | null;
  if (!report) {
    return Response.json({ error: "No finalized saved report found." }, { status: 404 });
  }

  const permissions = getPermissionsFromUser(user);
  const hasReportPermission =
    permissions.includes("reports.view_all") ||
    permissions.includes("reports.view_assigned") ||
    permissions.includes("reports.monitor_grade_level") ||
    permissions.includes("reports.monitor_subjects");
  if (!hasReportPermission) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = await fetchMyAssignedScope(user.id, adminClient);
  if (!canAccessReport({ permissions, userId: user.id, report, scope })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [examResult, sectionResult, teacherResult] = await Promise.all([
    adminClient
      .from("exams")
      .select(
        "exam_id, title, total_items, exam_date, quarters(name), curriculum_subjects(subject_id, subjects(name, subject_type))",
      )
      .eq("exam_id", examId)
      .maybeSingle(),
    adminClient
      .from("sections")
      .select("section_id, name, grade_levels(display_name, level_number)")
      .eq("section_id", sectionId)
      .maybeSingle(),
    report.curriculum_subject_id == null
      ? Promise.resolve({ data: null, error: null })
      : adminClient
          .from("teacher_class_assignments")
          .select("users!teacher_id(first_name, last_name)")
          .eq("section_id", sectionId)
          .eq("curriculum_subject_id", report.curriculum_subject_id)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle(),
  ]);

  if (examResult.error || sectionResult.error || teacherResult.error) {
    return Response.json({ error: "Failed to load report metadata." }, { status: 500 });
  }

  const exam = examResult.data as ExamRow | null;
  const section = sectionResult.data as SectionRow | null;
  if (!exam || !section) {
    return Response.json({ error: "Report metadata not found." }, { status: 404 });
  }

  const subjectJoin = firstJoin(firstJoin(exam.curriculum_subjects)?.subjects);
  const quarterJoin = firstJoin(exam.quarters);
  const gradeJoin = firstJoin(section.grade_levels);
  const subjectName = subjectJoin?.name ?? "Unknown Subject";
  const gradeName = gradeJoin?.display_name ?? `Grade ${report.grade_level_id ?? ""}`.trim();
  const sectionName = section.name ?? `Section ${sectionId}`;
  const rows = parseProficiencyRows(report);

  if (rows.length === 0) {
    return Response.json({ error: "No saved student scores found for this report." }, { status: 404 });
  }

  return buildWorkbook({
    examTitle: exam.title,
    subjectName,
    subjectTeacher: teacherName(teacherResult.data as TeacherAssignmentRow | null),
    gradeName,
    sectionName,
    quarterName: quarterJoin?.name ?? "-",
    examDate: formatDate(exam.exam_date),
    totalItems: toFiniteNumber(report.total_items ?? exam.total_items),
    generatedByEmail: user.email ?? user.id,
    details: {
      totalCases: toFiniteNumber(report.total_cases),
      totalScore: toFiniteNumber(report.total_score),
      mean: toFiniteNumber(report.mean),
      pl: toFiniteNumber(report.pl),
      highestScore: toFiniteNumber(report.highest_score),
      lowestScore: toFiniteNumber(report.lowest_score),
      mps: toFiniteNumber(report.mps),
      passCount: toFiniteNumber(report.total_achieved),
    },
    rows,
  });
};

function buildWorkbook({
  examTitle,
  subjectName,
  subjectTeacher,
  gradeName,
  sectionName,
  quarterName,
  examDate,
  totalItems,
  generatedByEmail,
  details,
  rows,
}: {
  examTitle: string;
  subjectName: string;
  subjectTeacher: string;
  gradeName: string;
  sectionName: string;
  quarterName: string;
  examDate: string;
  totalItems: number;
  generatedByEmail: string;
  details: {
    totalCases: number;
    totalScore: number;
    mean: number;
    pl: number;
    highestScore: number;
    lowestScore: number;
    mps: number;
    passCount: number;
  };
  rows: ProficiencyRow[];
}): Response {
  const wb = XLSXStyle.utils.book_new();
  const ws: Worksheet = {};
  const thin = { style: "thin", color: { rgb: "000000" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const center = { horizontal: "center", vertical: "center", wrapText: true };
  const left = { horizontal: "left", vertical: "center", wrapText: true };
  const greenFill = { patternType: "solid", fgColor: { rgb: "4EAE4A" } };
  const grayFill = { patternType: "solid", fgColor: { rgb: "E9ECEF" } };
  const titleFont = { name: "Sans Serif", sz: 18, bold: true };
  const headerFont = { name: "Sans Serif", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
  const subHeaderFont = { name: "Sans Serif", sz: 10, bold: true };
  const bodyFont = { name: "Sans Serif", sz: 10 };

  ws["!cols"] = [
    { wch: 6 },   // No.
    { wch: 34 },  // Name
    { wch: 12 },  // Score
    { wch: 12 },  // MPL
    { wch: 24 },  // Proficiency Level
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];

  const merges: XLSXStyle.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },
    { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } },
    { s: { r: 6, c: 1 }, e: { r: 6, c: 3 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 10 } },
    { s: { r: 4, c: 7 }, e: { r: 4, c: 10 } },
    { s: { r: 5, c: 7 }, e: { r: 5, c: 10 } },
    { s: { r: 6, c: 7 }, e: { r: 6, c: 10 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 7 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },
  ];
  const rowInfo: XLSXStyle.RowInfo[] = [
    { hpt: 14 },
    { hpt: 30 },
    { hpt: 14 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 10 },
    { hpt: 10 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 18 },
    { hpt: 10 },
    { hpt: 20 },
    { hpt: 20 },
  ];

  const setCell = (
    address: string,
    value: string | number,
    style: XLSXStyle.CellObject["s"],
    type: "s" | "n" = typeof value === "number" ? "n" : "s",
  ) => {
    ws[address] = { v: value, t: type, s: style };
  };

  const labelStyle = { font: subHeaderFont, alignment: { horizontal: "left", vertical: "center" }, border };
  const valueStyle = { font: bodyFont, alignment: left, border };
  const headerStyle = { font: headerFont, alignment: center, fill: greenFill, border };
  const groupStyle = { font: subHeaderFont, alignment: center, fill: grayFill, border };
  const bodyStyle = { font: bodyFont, alignment: center, border };
  const leftBodyStyle = { font: bodyFont, alignment: { horizontal: "left", vertical: "center", wrapText: false }, border };

  const generatedOn = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  setCell("A1", `Generated by ${generatedByEmail} on ${generatedOn}`, { font: bodyFont, alignment: { horizontal: "left", vertical: "center" } });
  setCell("A2", "Individual Exam Result", { font: titleFont, alignment: center });

  const metadata = [
    ["Exam Title", examTitle],
    ["Subject Teacher", subjectTeacher],
    ["Grade", gradeName],
    ["Section", sectionName],
    ["Subject", subjectName],
    ["Quarter", quarterName],
    ["Exam Date", examDate],
    ["Total Items", totalItems],
  ] as const;
  metadata.forEach(([label, value], index) => {
    const labelCol = index < 4 ? "A" : "G";
    const valueCol = index < 4 ? "B" : "H";
    const actualRow = index < 4 ? index + 4 : index;
    setCell(`${labelCol}${actualRow}`, label, labelStyle);
    setCell(`${valueCol}${actualRow}`, value, valueStyle, typeof value === "number" ? "n" : "s");
  });
  // Right-edge borders for both metadata value merge ranges (cols D and K, rows 4–7)
  const rightBorder = { border: { right: thin } };
  for (let i = 0; i < 4; i++) {
    const r = 3 + i;
    ws[XLSXStyle.utils.encode_cell({ r, c: 3 })] = { v: "", t: "s", s: rightBorder };
    ws[XLSXStyle.utils.encode_cell({ r, c: 10 })] = { v: "", t: "s", s: rightBorder };
  }

  const sdValue = rows.length > 0
    ? Math.sqrt(rows.reduce((sum, r) => sum + (r.testScore - details.mean) ** 2, 0) / rows.length)
    : 0;

  const detailStart = 11;
  const detailLabels = [
    "No. of Items",
    "Number of Cases",
    "Total Score",
    "Mean",
    "PL",
    "Highest Score",
    "Lowest Score",
    "SD",
  ];
  const detailValues = [
    totalItems,
    details.totalCases,
    details.totalScore,
    formatNumber(details.mean),
    formatNumber(details.pl),
    details.highestScore,
    details.lowestScore,
    formatNumber(sdValue),
  ];
  setCell(`A${detailStart - 1}`, "Details", { font: subHeaderFont, alignment: left });
  detailLabels.forEach((label, index) => setCell(XLSXStyle.utils.encode_cell({ r: detailStart - 1, c: index }), label, headerStyle));
  detailValues.forEach((value, index) =>
    setCell(
      XLSXStyle.utils.encode_cell({ r: detailStart, c: index }),
      value,
      bodyStyle,
      typeof value === "number" ? "n" : "s",
    ),
  );

  const profStart = 15;
  setCell(`A${profStart - 1}`, "Proficiency Level Obtained", { font: subHeaderFont, alignment: left });
  ["No.", "Name", "Score", "MPL", "Proficiency Level Obtained"].forEach((label, index) =>
    setCell(XLSXStyle.utils.encode_cell({ r: profStart - 1, c: index }), label, headerStyle),
  );

  let rowIdx = profStart;
  const addGroup = (label: string) => {
    for (let c = 0; c <= 4; c++) {
      setCell(XLSXStyle.utils.encode_cell({ r: rowIdx, c }), c === 0 ? label : "", groupStyle);
    }
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 4 } });
    rowIdx++;
  };
  const addStudent = (row: ProficiencyRow, index: number) => {
    const values = [
      index,
      row.pupilName,
      row.testScore,
      `${formatNumber(row.mpl, 1)}%`,
      row.proficiencyLevel,
    ];
    values.forEach((value, c) =>
      setCell(XLSXStyle.utils.encode_cell({ r: rowIdx, c }), value, c === 1 ? leftBodyStyle : bodyStyle),
    );
    rowIdx++;
  };

  const maleRows = rows.filter((row) => row.sex === "Male");
  const femaleRows = rows.filter((row) => row.sex === "Female");
  if (maleRows.length > 0) {
    addGroup(`Male (${maleRows.length})`);
    maleRows.forEach((row, index) => addStudent(row, index + 1));
  }
  if (femaleRows.length > 0) {
    addGroup(`Female (${femaleRows.length})`);
    femaleRows.forEach((row, index) => addStudent(row, index + 1));
  }

  addSummaryTables({
    ws,
    setCell,
    merges,
    startRow: profStart,
    startCol: 6,
    rows,
    headerStyle,
    bodyStyle,
    titleStyle: { font: subHeaderFont, alignment: left },
  });

  ws["!merges"] = merges;
  ws["!rows"] = rowInfo;
  ws["!ref"] = `A1:V${Math.max(rowIdx, 36)}`;
  ws["!pageSetup"] = { paperSize: 9, orientation: "landscape" };
  ws["!margins"] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  ws["!protect"] = {};

  XLSXStyle.utils.book_append_sheet(wb, ws, "Exam Result");
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  const displayFilename = safeFilename(`${gradeName} • ${subjectName} • ${sectionName}.xlsx`);
  const asciiFilename = displayFilename.replace(/[^\x20-\x7E]/g, "_");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(displayFilename)}`,
    },
  });
}

function addSummaryTables({
  ws,
  setCell,
  merges,
  startRow,
  startCol,
  rows,
  headerStyle,
  bodyStyle,
  titleStyle,
}: {
  ws: Worksheet;
  setCell: (
    address: string,
    value: string | number,
    style: XLSXStyle.CellObject["s"],
    type?: "s" | "n",
  ) => void;
  merges: XLSXStyle.Range[];
  startRow: number;
  startCol: number;
  rows: ProficiencyRow[];
  headerStyle: XLSXStyle.CellObject["s"];
  bodyStyle: XLSXStyle.CellObject["s"];
  titleStyle: XLSXStyle.CellObject["s"];
}) {
  const maleRows = rows.filter((row) => row.sex === "Male");
  const femaleRows = rows.filter((row) => row.sex === "Female");
  const makeMplRow = (label: string, groupRows: ProficiencyRow[]) => {
    const testTakers = groupRows.length;
    const achieved = groupRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
    const failed = testTakers - achieved;
    return { label, testTakers, achieved, failed };
  };
  const mplRows = [
    makeMplRow("Male", maleRows),
    makeMplRow("Female", femaleRows),
    makeMplRow("Total", rows),
  ];
  const writeTable = (title: string, headers: string[], values: (string | number)[][], row: number) => {
    setCell(XLSXStyle.utils.encode_cell({ r: row - 1, c: startCol }), title, titleStyle);
    if (headers.length > 1) {
      merges.push({ s: { r: row - 1, c: startCol }, e: { r: row - 1, c: startCol + headers.length - 1 } });
    }
    headers.forEach((header, i) =>
      setCell(XLSXStyle.utils.encode_cell({ r: row, c: startCol + i }), header, headerStyle),
    );
    values.forEach((valueRow, r) =>
      valueRow.forEach((value, c) =>
        setCell(
          XLSXStyle.utils.encode_cell({ r: row + r + 1, c: startCol + c }),
          value,
          bodyStyle,
          typeof value === "number" ? "n" : "s",
        ),
      ),
    );
    return row + values.length + 3;
  };
  const writeLongMatrixTable = ({
    title,
    groups,
    row,
    trailingHeaders = [],
    trailingValues = [],
  }: {
    title: string;
    groups: { label: string; values: [string | number, string | number, string | number] }[];
    row: number;
    trailingHeaders?: string[];
    trailingValues?: (string | number)[];
  }) => {
    setCell(XLSXStyle.utils.encode_cell({ r: row - 1, c: startCol }), title, titleStyle);
    merges.push({ s: { r: row - 1, c: startCol }, e: { r: row - 1, c: startCol + groups.length * 3 + trailingHeaders.length - 1 } });

    let col = startCol;
    for (const group of groups) {
      for (let offset = 0; offset < 3; offset++) {
        setCell(
          XLSXStyle.utils.encode_cell({ r: row, c: col + offset }),
          offset === 0 ? group.label : "",
          headerStyle,
        );
      }
      merges.push({ s: { r: row, c: col }, e: { r: row, c: col + 2 } });
      ["Male", "Female", "Total"].forEach((label, offset) =>
        setCell(XLSXStyle.utils.encode_cell({ r: row + 1, c: col + offset }), label, headerStyle),
      );
      group.values.forEach((value, offset) =>
        setCell(
          XLSXStyle.utils.encode_cell({ r: row + 2, c: col + offset }),
          value,
          bodyStyle,
          typeof value === "number" ? "n" : "s",
        ),
      );
      col += 3;
    }

    trailingHeaders.forEach((header, index) => {
      const currentCol = col + index;
      setCell(XLSXStyle.utils.encode_cell({ r: row, c: currentCol }), header, headerStyle);
      setCell(XLSXStyle.utils.encode_cell({ r: row + 1, c: currentCol }), header, headerStyle);
      setCell(
        XLSXStyle.utils.encode_cell({ r: row + 2, c: currentCol }),
        trailingValues[index] ?? "",
        bodyStyle,
        typeof trailingValues[index] === "number" ? "n" : "s",
      );
      merges.push({ s: { r: row, c: currentCol }, e: { r: row + 1, c: currentCol } });
    });

    return row + 5;
  };

  let nextRow = writeTable(
    "Achieved/Exceeded 60% MPL",
    ["Group", "Test Taker", "Achieved", "Percentage"],
    mplRows.map((row) => [
      row.label,
      row.testTakers,
      row.achieved,
      formatPercentage(row.achieved, row.testTakers),
    ]),
    startRow,
  );
  nextRow = writeTable(
    "Failed 30% MPL",
    ["Group", "Test Taker", "Failed", "Percentage"],
    mplRows.map((row) => [
      row.label,
      row.testTakers,
      row.failed,
      formatPercentage(row.failed, row.testTakers),
    ]),
    nextRow,
  );

  const total = rows.length;
  const maleAchieved = maleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
  const femaleAchieved = femaleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
  const achieved = maleAchieved + femaleAchieved;
  nextRow = writeLongMatrixTable({
    title: "LAEMPL",
    groups: [
      { label: "Number of Enrolled Learners", values: [maleRows.length, femaleRows.length, total] },
      { label: "Number of Test Takers", values: [maleRows.length, femaleRows.length, total] },
      { label: "Number of Learners who attained or exceeded the Minimum Proficiency Level (60%)", values: [maleAchieved, femaleAchieved, achieved] },
      {
        label: "Percentage of LAEMPL",
        values: [
          formatPercentage(maleAchieved, maleRows.length),
          formatPercentage(femaleAchieved, femaleRows.length),
          formatPercentage(achieved, total),
        ],
      },
    ],
    trailingHeaders: ["MEAN", "MPS"],
    trailingValues: [
      formatNumber(average(rows.map((row) => row.testScore))),
      `${formatNumber(average(rows.map((row) => row.mpl)))}%`,
    ],
    row: nextRow,
  });

  writeLongMatrixTable({
    title: "Proficiency Level",
    groups: PROFICIENCY_LEVELS.map((level) => {
      const male = maleRows.filter((row) => row.proficiencyLevel === level).length;
      const female = femaleRows.filter((row) => row.proficiencyLevel === level).length;
      return { label: `Number of ${level} Learners`, values: [male, female, male + female] };
    }),
    trailingHeaders: ["OVER ALL"],
    trailingValues: [rows.length],
    row: nextRow,
  });
}

export const GET = withErrorHandler(_GET);
