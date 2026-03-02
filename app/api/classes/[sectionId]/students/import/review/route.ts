import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportRowStatus =
  | "will_add"
  | "will_enroll"
  | "will_restore"
  | "will_move"
  | "already_enrolled"
  | "transfer_required"
  | "pending_request"
  | "format_error"
  | "duplicate_lrn";

export interface ReviewRow {
  rowNum: number;
  lrn: string;
  rawName: string;
  rawSex: string;
  status: ImportRowStatus;
  action?: "new" | "enroll" | "restore_enroll" | "move";
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  sex?: "M" | "F";
  /** Name from DB — populated for existing students */
  dbName?: string;
  errorMessage?: string;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const NAME_RE = /^[a-zA-Z\u00C0-\u024F]+(?:\s[a-zA-Z\u00C0-\u024F]+)*$/;

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function validateName(value: string, required: boolean): string | null {
  const t = value.trim();
  if (!t) return required ? "required" : null;
  if (t.length < 2) return "min 2 chars";
  if (t.length > 100) return "max 100 chars";
  if (!NAME_RE.test(t)) return "letters only";
  return null;
}

/** Parse a combined name cell "Last, First, Middle" into parts.
 *  Returns null if unparseable (less than 2 comma-separated parts). */
function parseName(
  raw: string,
): { last_name: string; first_name: string; middle_name: string } | null {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return {
    last_name: parts[0],
    first_name: parts[1],
    middle_name: parts[2] ?? "",
  };
}

// ─── POST /api/classes/[sectionId]/students/import/review ─────────────────────
// Accepts a multipart/form-data upload with field "file" (.xlsx).
// Parses the Excel, validates format, runs LRN checks, and returns review rows.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasFullAccess = permissions.includes("full_access_student_management");
  const hasPartialAccess = permissions.includes(
    "partial_access_student_management",
  );
  if (!hasFullAccess && !hasPartialAccess)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  // ── Parse multipart upload ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File))
    return Response.json({ error: "No file provided." }, { status: 400 });

  const arrayBuffer = await fileEntry.arrayBuffer();

  // ── Parse Excel ─────────────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  try {
    // Newer @types/node made Buffer generic (Buffer<ArrayBuffer>) which is
    // incompatible with ExcelJS's Buffer type; pass ArrayBuffer directly.
    await workbook.xlsx.load(arrayBuffer as unknown as Buffer);
  } catch {
    return Response.json(
      { error: "Could not read file. Make sure it is a valid .xlsx file." },
      { status: 400 },
    );
  }

  const ws = workbook.worksheets[0];
  if (!ws)
    return Response.json({ error: "The file has no worksheets." }, { status: 400 });

  // ── Extract data rows (row 4 onward, skip fully-blank rows) ─────────────────
  const rawRows: Array<{
    rowNum: number;
    lrn: string;
    name: string;
    sex: string;
  }> = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return; // skip header rows
    const lrnCell = row.getCell(1);
    const nameCell = row.getCell(2);
    const sexCell = row.getCell(3);

    const lrnRaw = String(lrnCell.text ?? lrnCell.value ?? "").trim();
    const nameRaw = String(nameCell.text ?? nameCell.value ?? "").trim();
    const sexRaw = String(sexCell.text ?? sexCell.value ?? "").trim();

    // Skip fully blank rows
    if (!lrnRaw && !nameRaw && !sexRaw) return;

    rawRows.push({ rowNum, lrn: lrnRaw, name: nameRaw, sex: sexRaw });
  });

  if (rawRows.length === 0)
    return Response.json({ error: "The file contains no data rows." }, { status: 400 });

  if (rawRows.length > 100)
    return Response.json(
      { error: "Too many rows. Maximum 100 students per import." },
      { status: 400 },
    );

  // ── Format validation ───────────────────────────────────────────────────────
  const seenLrns = new Map<string, number>(); // lrn → first rowNum

  const formatChecked = rawRows.map((r) => {
    const errors: string[] = [];

    // LRN
    const lrn = r.lrn.replace(/\D/g, ""); // strip non-digits (e.g. leading apostrophe from Excel)
    if (!/^\d{12}$/.test(lrn)) errors.push("LRN must be exactly 12 digits");

    // Name — parse even if LRN invalid (to show as much info as possible)
    const parsed = r.name ? parseName(r.name) : null;
    if (!parsed) {
      errors.push("Name must be: Last Name, First Name[, Middle Name]");
    } else {
      const lastErr = validateName(parsed.last_name, true);
      const firstErr = validateName(parsed.first_name, true);
      const midErr = validateName(parsed.middle_name, false);
      if (lastErr) errors.push(`Last name: ${lastErr}`);
      if (firstErr) errors.push(`First name: ${firstErr}`);
      if (midErr) errors.push(`Middle name: ${midErr}`);
    }

    // Sex
    const sexUpper = r.sex.toUpperCase();
    if (!["M", "F"].includes(sexUpper)) errors.push("Sex must be M or F");

    if (errors.length > 0) {
      // Preserve whatever DID parse successfully so the edit form can pre-populate
      const validSex =
        ["M", "F"].includes(sexUpper) ? (sexUpper as "M" | "F") : null;
      return {
        rowNum: r.rowNum,
        lrn,
        rawName: r.name,
        rawSex: r.sex,
        status: "format_error" as ImportRowStatus,
        errorMessage: errors.join("; "),
        parsed: parsed ?? null,   // keep parsed name if it succeeded
        sexNorm: validSex,        // keep valid sex if it succeeded
      };
    }

    return {
      rowNum: r.rowNum,
      lrn,
      rawName: r.name,
      rawSex: r.sex,
      status: null as ImportRowStatus | null,
      errorMessage: undefined,
      parsed: parsed!,
      sexNorm: sexUpper as "M" | "F",
    };
  });

  // ── Deduplicate LRNs ────────────────────────────────────────────────────────
  const withDedupe = formatChecked.map((r) => {
    if (r.status === "format_error") return r;
    const existing = seenLrns.get(r.lrn);
    if (existing !== undefined) {
      return {
        ...r,
        status: "duplicate_lrn" as ImportRowStatus,
        errorMessage: `Duplicate of row ${existing}`,
      };
    }
    seenLrns.set(r.lrn, r.rowNum);
    return r;
  });

  // ── LRN database checks ─────────────────────────────────────────────────────
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get the section's sy_id + adviser_id once
  const { data: sectionRaw } = await admin
    .from("sections")
    .select("sy_id, adviser_id")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sectionRaw)
    return Response.json({ error: "Section not found." }, { status: 404 });

  const syId: number = (sectionRaw as any).sy_id;
  const sectionAdviserId: string | null = (sectionRaw as any).adviser_id ?? null;

  // Collect LRNs that need checking
  const lrnsToCheck = withDedupe
    .filter((r) => r.status === null)
    .map((r) => r.lrn);

  // Batch fetch students
  const { data: studentRows } = await admin
    .from("students")
    .select("lrn, last_name, first_name, middle_name, sex, full_name, deleted_at")
    .in("lrn", lrnsToCheck.length > 0 ? lrnsToCheck : [""]);

  const studentMap = new Map(
    ((studentRows ?? []) as any[]).map((s: any) => [s.lrn as string, s]),
  );

  // Batch fetch enrollments for these LRNs in this school year
  const { data: enrollRows } = await admin
    .from("enrollments")
    .select(
      "lrn, section_id, sections(name, adviser_id, grade_levels(display_name))",
    )
    .in("lrn", lrnsToCheck.length > 0 ? lrnsToCheck : [""])
    .eq("sy_id", syId)
    .is("deleted_at", null);

  const enrollMap = new Map(
    ((enrollRows ?? []) as any[]).map((e: any) => [e.lrn as string, e]),
  );

  // Batch fetch pending transfer requests for these LRNs
  const { data: pendingRows } = await admin
    .from("section_transfer_requests")
    .select("lrn")
    .in("lrn", lrnsToCheck.length > 0 ? lrnsToCheck : [""])
    .eq("status", "PENDING");

  const pendingSet = new Set(
    ((pendingRows ?? []) as any[]).map((p: any) => p.lrn as string),
  );

  // ── Map each row to a final ReviewRow ──────────────────────────────────────
  const reviewRows: ReviewRow[] = withDedupe.map((r) => {
    const base: ReviewRow = {
      rowNum: r.rowNum,
      lrn: r.lrn,
      rawName: r.rawName,
      rawSex: r.rawSex,
    };

    // Apply name parts to base (for review + editing)
    const nameFields = r.parsed
      ? {
          last_name: toTitleCase(r.parsed.last_name),
          first_name: toTitleCase(r.parsed.first_name),
          middle_name: r.parsed.middle_name
            ? toTitleCase(r.parsed.middle_name)
            : "",
          ...(r.sexNorm ? { sex: r.sexNorm as "M" | "F" } : {}),
        }
      : {};

    // Already tagged from format/dedupe checks.
    // Keep whatever parsed fields were valid so row editing is prefilled.
    if (r.status === "format_error" || r.status === "duplicate_lrn") {
      return {
        ...base,
        ...nameFields,
        status: r.status,
        errorMessage: r.errorMessage,
      };
    }

    const studentData = studentMap.get(r.lrn);
    const enrollData = enrollMap.get(r.lrn);

    // Not found in students table → new student
    if (!studentData) {
      return {
        ...base,
        ...nameFields,
        status: "will_add",
        action: "new",
      };
    }

    // Student exists but is soft-deleted
    if (studentData.deleted_at !== null) {
      return {
        ...base,
        ...nameFields,
        status: "will_restore",
        action: "restore_enroll",
        dbName: (studentData.full_name ?? "") as string,
      };
    }

    // Student active, no enrollment this school year → enroll
    if (!enrollData) {
      return {
        ...base,
        ...nameFields,
        status: "will_enroll",
        action: "enroll",
        dbName: (studentData.full_name ?? "") as string,
      };
    }

    // Already enrolled in THIS section
    if ((enrollData as any).section_id === sectionId) {
      return {
        ...base,
        ...nameFields,
        status: "already_enrolled",
        dbName: (studentData.full_name ?? "") as string,
      };
    }

    // Enrolled elsewhere
    const fromSection = Array.isArray((enrollData as any).sections)
      ? (enrollData as any).sections[0]
      : (enrollData as any).sections;
    const fromAdviserUid: string | null = fromSection?.adviser_id ?? null;
    const hasAdviser = fromAdviserUid !== null;
    const selfAdviser = hasAdviser && fromAdviserUid === user.id;

    // canMoveDirect: full_access, or no adviser on source, or self_adviser
    const canMoveDirect = hasFullAccess || !hasAdviser || selfAdviser;

    if (canMoveDirect) {
      // Check for pending request only when partial_access user can't move directly anyway (they can move here)
      return {
        ...base,
        ...nameFields,
        status: "will_move",
        action: "move",
        dbName: (studentData.full_name ?? "") as string,
      };
    }

    // Partial access + has adviser + not self → needs transfer request
    if (pendingSet.has(r.lrn)) {
      return {
        ...base,
        ...nameFields,
        status: "pending_request",
        dbName: (studentData.full_name ?? "") as string,
        errorMessage: "A transfer request for this student is already pending.",
      };
    }

    return {
      ...base,
      ...nameFields,
      status: "transfer_required",
      dbName: (studentData.full_name ?? "") as string,
      errorMessage:
        "Student is enrolled in another class. Use Add Student to send a transfer request.",
    };
  });

  return Response.json({ rows: reviewRows });
}
