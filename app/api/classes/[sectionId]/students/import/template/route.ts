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

  const { data: sectionRaw } = await admin
    .from("sections")
    .select("name, grade_levels(display_name)")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sectionRaw)
    return Response.json({ error: "Section not found." }, { status: 404 });

  const sec = sectionRaw as any;
  const glRaw = sec.grade_levels;
  const gradeLevel: string = Array.isArray(glRaw)
    ? (glRaw[0]?.display_name ?? "")
    : (glRaw?.display_name ?? "");

  // ── Build Template Excel ────────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Roster");

  ws.pageSetup = { paperSize: 9, orientation: "portrait" };
  ws.pageSetup.margins = {
    left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3,
  };

  // Column widths — match Download Roster (cols A-C only)
  ws.getColumn(1).width = 18.71; // A – LRN
  ws.getColumn(2).width = 35;    // B – Name
  ws.getColumn(3).width = 24;    // C – Sex

  const thin: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
  const allBorders: Partial<ExcelJS.Borders> = {
    top: thin, bottom: thin, left: thin, right: thin,
  };
  const centerMid: Partial<ExcelJS.Alignment> = {
    horizontal: "center", vertical: "middle",
  };

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws.mergeCells("A1:C1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "E-Class Record";
  titleCell.font = { name: "Sans Serif", size: 21, bold: true };
  titleCell.alignment = centerMid;
  ws.getRow(1).height = 37.5;

  // ── Row 2: Spacer ─────────────────────────────────────────────────────────
  ws.getRow(2).height = 12;

  // ── Row 3: Column headers ─────────────────────────────────────────────────
  ws.getRow(3).height = 50.25;

  const headerFont: Partial<ExcelJS.Font> = {
    name: "Sans Serif", size: 11, bold: true,
  };

  const lrnHeader = ws.getCell("A3");
  lrnHeader.value = "LRN";
  lrnHeader.font = headerFont;
  lrnHeader.alignment = { ...centerMid, wrapText: true };
  lrnHeader.border = allBorders;

  const nameHeader = ws.getCell("B3");
  nameHeader.value = "NAME (Last Name, First Name, Middle Name)";
  nameHeader.font = headerFont;
  nameHeader.alignment = { ...centerMid, wrapText: true };
  nameHeader.border = allBorders;

  const sexHeader = ws.getCell("C3");
  sexHeader.value = "Sex (M/F)";
  sexHeader.font = headerFont;
  sexHeader.alignment = { ...centerMid, wrapText: true };
  sexHeader.border = allBorders;

  // ── Rows 4–53: Blank data rows ────────────────────────────────────────────
  const dataFont: Partial<ExcelJS.Font> = { name: "Sans Serif", size: 11 };
  for (let r = 4; r <= 53; r++) {
    ws.getRow(r).height = 18;
    const cellA = ws.getCell(`A${r}`);
    cellA.numFmt = "@"; // force text for LRN
    cellA.font = dataFont;
    cellA.border = allBorders;

    const cellB = ws.getCell(`B${r}`);
    cellB.font = dataFont;
    cellB.border = allBorders;

    const cellC = ws.getCell(`C${r}`);
    cellC.font = dataFont;
    cellC.alignment = centerMid;
    cellC.border = allBorders;
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const safeName = `${gradeLevel} - ${sec.name} Roster Template.xlsx`.replace(
    /[<>:"/\\|?*]/g,
    "_",
  );

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
