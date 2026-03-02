import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

// ─── POST /api/classes/[sectionId]/students/import ────────────────────────────
// Bulk-enrolls students that were reviewed and confirmed by the user.
// Supports actions: new, enroll, restore_enroll, move.

interface ImportStudent {
  lrn: string;
  action: "new" | "enroll" | "restore_enroll" | "move";
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  sex?: "M" | "F";
}

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

  const body = (await request.json()) as { students?: unknown };
  const students = body.students;

  if (!Array.isArray(students) || students.length === 0)
    return Response.json({ error: "No students provided." }, { status: 400 });

  if (students.length > 100)
    return Response.json(
      { error: "Too many students. Maximum 100 per import." },
      { status: 400 },
    );

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get section's sy_id + adviser_id
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

  // Partial-access permission gate: must be adviser of this section
  if (!hasFullAccess) {
    if (sectionAdviserId !== user.id) {
      return Response.json(
        { error: "Only the class adviser can import students into this section." },
        { status: 403 },
      );
    }
  }

  // ── Process each student ────────────────────────────────────────────────────
  const results: Array<{ lrn: string; success: boolean; error?: string }> = [];

  for (const raw of students) {
    const s = raw as ImportStudent;
    const lrn = (s.lrn ?? "").trim();

    if (!/^\d{12}$/.test(lrn)) {
      results.push({ lrn, success: false, error: "Invalid LRN format." });
      continue;
    }

    const validActions = ["new", "enroll", "restore_enroll", "move"];
    if (!validActions.includes(s.action ?? "")) {
      results.push({ lrn, success: false, error: "Invalid action." });
      continue;
    }

    try {
      if (s.action === "new") {
        const lastName = (s.last_name ?? "").trim();
        const firstName = (s.first_name ?? "").trim();
        const middleName = (s.middle_name ?? "").trim();
        const sex = s.sex ?? "M";

        if (!lastName || !firstName || !sex)
          throw new Error("Name and sex are required for new students.");

        const { error: insertErr } = await admin.from("students").insert({
          lrn,
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName || null,
          sex,
        });

        if (insertErr) {
          if (insertErr.code === "23505")
            throw new Error("A student with this LRN already exists.");
          throw new Error(insertErr.message);
        }

        const { error: enrollErr } = await admin.rpc("upsert_enrollment", {
          p_lrn: lrn,
          p_section_id: sectionId,
          p_sy_id: syId,
        });
        if (enrollErr) throw new Error(enrollErr.message);

      } else if (s.action === "enroll") {
        const { error: enrollErr } = await admin.rpc("upsert_enrollment", {
          p_lrn: lrn,
          p_section_id: sectionId,
          p_sy_id: syId,
        });
        if (enrollErr) throw new Error(enrollErr.message);

      } else if (s.action === "restore_enroll") {
        const { error: restoreErr } = await admin
          .from("students")
          .update({ deleted_at: null })
          .eq("lrn", lrn);
        if (restoreErr) throw new Error(restoreErr.message);

        const { error: enrollErr } = await admin.rpc("upsert_enrollment", {
          p_lrn: lrn,
          p_section_id: sectionId,
          p_sy_id: syId,
        });
        if (enrollErr) throw new Error(enrollErr.message);

      } else if (s.action === "move") {
        // Re-validate move permission on server side
        if (!hasFullAccess) {
          // partial_access: must be adviser of THIS section (already checked above)
          // Additionally verify canMoveDirect conditions for the source section
          const { data: enrollData } = await admin
            .from("enrollments")
            .select("section_id, sections(adviser_id)")
            .eq("lrn", lrn)
            .eq("sy_id", syId)
            .is("deleted_at", null)
            .maybeSingle();

          if (enrollData) {
            const fromSection = Array.isArray((enrollData as any).sections)
              ? (enrollData as any).sections[0]
              : (enrollData as any).sections;
            const fromAdviserId: string | null = fromSection?.adviser_id ?? null;
            const hasAdviser = fromAdviserId !== null;
            const selfAdviser = hasAdviser && fromAdviserId === user.id;
            const canMoveDirect = !hasAdviser || selfAdviser;

            if (!canMoveDirect) {
              throw new Error(
                "Transfer request required — cannot move directly.",
              );
            }
          }
        }

        const { error: moveErr } = await admin.rpc("move_student_enrollment", {
          p_lrn: lrn,
          p_sy_id: syId,
          p_section_id: sectionId,
        });
        if (moveErr) {
          if (moveErr.code === "23505")
            throw new Error("Student is already enrolled in this class.");
          throw new Error(moveErr.message);
        }

        // Cancel any open transfer requests since the student has moved
        await admin
          .from("section_transfer_requests")
          .update({ status: "CANCELLED", cancellation_reason: "MOVED_BY_ADMIN" })
          .eq("lrn", lrn)
          .eq("status", "PENDING");
      }

      results.push({ lrn, success: true });
    } catch (e) {
      results.push({
        lrn,
        success: false,
        error: e instanceof Error ? e.message : "An error occurred.",
      });
    }
  }

  return Response.json({ results });
}
