import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function GET(
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
    permissions.includes("full_access_student_management") ||
    permissions.includes("partial_access_student_management");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

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
    return Response.json({ error: secError.message }, { status: 500 });
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
    return Response.json({ error: enrollErr.message }, { status: 500 });

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

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Roster");

  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
  };
  ws.pageSetup.margins = {
    left: 0.7,
    right: 0.7,
    top: 0.75,
    bottom: 0.75,
    header: 0.3,
    footer: 0.3,
  };

  // Column widths (match template exactly)
  ws.getColumn(1).width = 18.71; // A – LRN
  ws.getColumn(2).width = 35; // B – Name
  ws.getColumn(3).width = 24; // C – Sex
  ws.getColumn(4).width = 18.71; // D
  ws.getColumn(5).width = 24.71; // E
  ws.getColumn(6).width = 18.71; // F
  ws.getColumn(7).width = 14.29; // G
  ws.getColumn(8).width = 36; // H

  const thin: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
  const allBorders: Partial<ExcelJS.Borders> = {
    top: thin,
    bottom: thin,
    left: thin,
    right: thin,
  };

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "E-Class Record";
  titleCell.font = { name: "Sans Serif", size: 21, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 37.5;

  // ── Row 2: Spacer ─────────────────────────────────────────────────────────
  ws.getRow(2).height = 24.95;

  // ── Row 3: Metadata ───────────────────────────────────────────────────────
  ws.getRow(3).height = 24;

  const labelFont: Partial<ExcelJS.Font> = {
    name: "Sans Serif",
    size: 12,
    bold: true,
  };
  const valueFont: Partial<ExcelJS.Font> = { name: "Sans Serif", size: 12 };
  const leftMid: Partial<ExcelJS.Alignment> = {
    horizontal: "left",
    vertical: "middle",
  };
  const centerMid: Partial<ExcelJS.Alignment> = {
    horizontal: "center",
    vertical: "middle",
  };

  function fillMeta(
    ref: string,
    value: string,
    font: Partial<ExcelJS.Font>,
    align: Partial<ExcelJS.Alignment>,
  ) {
    const c = ws.getCell(ref);
    c.value = value;
    c.font = font;
    c.alignment = align;
    c.border = allBorders;
  }

  // School Year
  fillMeta("A3", "School Year:", labelFont, leftMid);
  fillMeta("B3", schoolYear, valueFont, centerMid);

  // Grade & Section — merge D3:F3 for a wider value cell
  fillMeta("C3", "Grade & Section:", labelFont, leftMid);
  ws.mergeCells("D3:E3");
  const gradeSectionCell = ws.getCell("D3");
  gradeSectionCell.value = `${gradeLevel} - ${sec.name}`;
  gradeSectionCell.font = valueFont;
  gradeSectionCell.alignment = centerMid;
  gradeSectionCell.border = allBorders;

  // Adviser
  fillMeta("F3", "Adviser:", labelFont, leftMid);
  fillMeta("G3", adviserName, valueFont, centerMid);
  ws.mergeCells("G3:H3");

  // ── Row 4: Spacer ─────────────────────────────────────────────────────────
  ws.getRow(4).height = 24.95;

  // ── Row 5: Column headers ─────────────────────────────────────────────────
  ws.getRow(5).height = 50.25;

  const headerFont: Partial<ExcelJS.Font> = {
    name: "Sans Serif",
    size: 11,
    bold: true,
  };

  const lrnHeader = ws.getCell("A5");
  lrnHeader.value = "LRN";
  lrnHeader.font = headerFont;
  lrnHeader.alignment = centerMid;
  lrnHeader.border = allBorders;

  const nameHeader = ws.getCell("B5");
  nameHeader.value = "NAME (Last Name, First Name, Middle Name)";
  nameHeader.font = headerFont;
  nameHeader.alignment = { ...centerMid, wrapText: true };
  nameHeader.border = allBorders;

  const sexHeader = ws.getCell("C5");
  sexHeader.value = "Sex (M/F)";
  sexHeader.font = headerFont;
  sexHeader.alignment = centerMid;
  sexHeader.border = allBorders;

  // ── Rows 6+: Group headers + student data ────────────────────────────────
  const dataFont: Partial<ExcelJS.Font> = { name: "Sans Serif", size: 11 };
  const groupHeaderFont: Partial<ExcelJS.Font> = {
    name: "Sans Serif",
    size: 11,
    bold: true,
  };
  const groupFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE9ECEF" }, // light gray
  };

  function addGroupHeader(rowNum: number, label: string) {
    ws.mergeCells(`A${rowNum}:C${rowNum}`);
    const cell = ws.getCell(`A${rowNum}`);
    cell.value = label;
    cell.font = groupHeaderFont;
    cell.alignment = centerMid;
    cell.fill = groupFill;
    cell.border = allBorders;
  }

  function addStudentRow(
    rowNum: number,
    student: { lrn: string; full_name: string; sex: string },
  ) {
    const cellA = ws.getCell(`A${rowNum}`);
    cellA.value = student.lrn;
    cellA.numFmt = "@"; // force text — prevents scientific notation
    cellA.font = dataFont;
    cellA.alignment = { vertical: "middle" };
    cellA.border = allBorders;

    const cellB = ws.getCell(`B${rowNum}`);
    cellB.value = student.full_name.toUpperCase();
    cellB.font = dataFont;
    cellB.alignment = { vertical: "middle" };
    cellB.border = allBorders;

    const cellC = ws.getCell(`C${rowNum}`);
    cellC.value = student.sex;
    cellC.font = dataFont;
    cellC.alignment = centerMid;
    cellC.border = allBorders;
  }

  let currentRow = 6;

  if (males.length > 0) {
    addGroupHeader(currentRow, `Male (${males.length})`);
    currentRow++;
    for (const student of males) {
      addStudentRow(currentRow, student);
      currentRow++;
    }
  }

  if (females.length > 0) {
    addGroupHeader(currentRow, `Female (${females.length})`);
    currentRow++;
    for (const student of females) {
      addStudentRow(currentRow, student);
      currentRow++;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const safeName = `${gradeLevel} - ${sec.name} Roster.xlsx`.replace(
    /[<>:"/\\|?*]/g,
    "_",
  );

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
