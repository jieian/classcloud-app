import { createClient } from "@supabase/supabase-js";
import * as XLSXStyle from "xlsx-js-style";
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

  const wb = XLSXStyle.utils.book_new();
  const ws: XLSXStyle.WorkSheet = {};

  const thin = { style: "thin", color: { rgb: "000000" } };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
  const centerMid = { horizontal: "center", vertical: "center" };

  // Column widths
  ws["!cols"] = [
    { wch: 18.71 }, // A – LRN
    { wch: 35 },    // B – Name
    { wch: 24 },    // C – Sex
  ];

  // Row heights (0-indexed, hpt = points)
  const wsRows: XLSXStyle.RowInfo[] = [];
  wsRows[0] = { hpt: 37.5 };  // Row 1: title
  wsRows[1] = { hpt: 12 };    // Row 2: spacer
  wsRows[2] = { hpt: 50.25 }; // Row 3: headers
  for (let r = 3; r <= 52; r++) wsRows[r] = { hpt: 18 }; // Rows 4–53: data
  ws["!rows"] = wsRows;

  // Merged cells
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // A1:C1
  ];

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws["A1"] = {
    v: "E-Class Record",
    t: "s",
    s: {
      font: { name: "Sans Serif", sz: 21, bold: true },
      alignment: centerMid,
    },
  };

  // ── Row 3: Column headers ─────────────────────────────────────────────────
  const headerStyle = {
    font: { name: "Sans Serif", sz: 11, bold: true },
    alignment: { ...centerMid, wrapText: true },
    border: allBorders,
  };
  ws["A3"] = { v: "LRN", t: "s", s: headerStyle };
  ws["B3"] = { v: "NAME (Last Name, First Name, Middle Name)", t: "s", s: headerStyle };
  ws["C3"] = { v: "Sex (M/F)", t: "s", s: headerStyle };

  // ── Rows 4–53: Blank data rows ────────────────────────────────────────────
  const dataFont = { name: "Sans Serif", sz: 11 };
  for (let r = 4; r <= 53; r++) {
    ws[`A${r}`] = {
      v: "", t: "s", z: "@", // force text format for LRN
      s: { font: dataFont, border: allBorders },
    };
    ws[`B${r}`] = {
      v: "", t: "s",
      s: { font: dataFont, border: allBorders },
    };
    ws[`C${r}`] = {
      v: "", t: "s",
      s: { font: dataFont, alignment: centerMid, border: allBorders },
    };
  }

  ws["!ref"] = "A1:C53";
  ws["!pageSetup"] = { paperSize: 9, orientation: "portrait" } as any;
  ws["!margins"] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

  XLSXStyle.utils.book_append_sheet(wb, ws, "Roster");
  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeName = `${gradeLevel} - ${sec.name} Roster Template.xlsx`.replace(
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
