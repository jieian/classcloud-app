import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, BulkImportSchema } from "@/lib/api-schemas";
import { isTeacherInSection } from "@/app/(app)/school/classes/_lib/classesServerService";
// ─── POST /api/classes/[sectionId]/students/import ────────────────────────────
// Bulk-enrolls students that were reviewed and confirmed by the user.
// Supports actions: new, enroll, restore_enroll, move.
// NOTE: Operations run in parallel per student but are NOT wrapped in a single
// DB transaction — partial failures are reported per-student without rollback.
// Full atomicity would require a server-side RPC.

const _POST = async function(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasFullAccess = permissions.includes("students.full_access");
  const hasPartialAccess = permissions.includes("students.limited_access");
  if (!hasFullAccess && !hasPartialAccess)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const parsed = parseBody(BulkImportSchema, await request.json());
  if (!parsed.success) return parsed.response;

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

  // Partial-access permission gate: must be adviser or assigned teacher
  if (!hasFullAccess && sectionAdviserId !== user.id) {
    const isTeacher = await isTeacherInSection(user.id, sectionId);
    if (!isTeacher) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pre-batch: for partial_access, fetch source-section adviser_ids for all
  // "move" LRNs in one query to avoid N serial lookups inside the parallel map.
  const moveSourceMap = new Map<string, { adviser_id: string | null }>();
  if (!hasFullAccess) {
    const moveLrns = parsed.data.students
      .filter((s) => s.action === "move")
      .map((s) => s.lrn);
    if (moveLrns.length > 0) {
      const { data: moveSrcData } = await admin
        .from("enrollments")
        .select("lrn, sections(adviser_id)")
        .in("lrn", moveLrns)
        .eq("sy_id", syId)
        .is("deleted_at", null);
      for (const row of (moveSrcData ?? []) as any[]) {
        const sec = Array.isArray(row.sections) ? row.sections[0] : row.sections;
        moveSourceMap.set(row.lrn as string, { adviser_id: sec?.adviser_id ?? null });
      }
    }
  }

  // ── Process each student in parallel ────────────────────────────────────────
  const settled = await Promise.allSettled(
    parsed.data.students.map(async (s) => {
      const lrn = s.lrn;

      if (s.action === "new") {
        const lastName = (s.last_name ?? "").trim();
        const firstName = (s.first_name ?? "").trim();
        const rawMiddleName = (s.middle_name ?? "").trim();
        const middleName = /^[-–—]+$/.test(rawMiddleName) ? "" : rawMiddleName;
        const sex = s.sex ?? "M";

        if (!lastName || !firstName)
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
        if (!hasFullAccess) {
          const srcSection = moveSourceMap.get(lrn);
          if (srcSection !== undefined) {
            const fromAdviserId = srcSection.adviser_id;
            const hasAdviser = fromAdviserId !== null;
            const selfAdviser = hasAdviser && fromAdviserId === user.id;
            const canMoveDirect = !hasAdviser || selfAdviser;
            if (!canMoveDirect)
              throw new Error("Transfer request required — cannot move directly.");
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

        await admin
          .from("section_transfer_requests")
          .update({ status: "CANCELLED", cancellation_reason: "MOVED_BY_ADMIN" })
          .eq("lrn", lrn)
          .eq("status", "PENDING");
      }

      return { lrn, success: true as const };
    }),
  );

  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          lrn: parsed.data.students[i].lrn,
          success: false as const,
          error: r.reason instanceof Error ? r.reason.message : "An error occurred.",
        },
  );

  return Response.json({ results });
}

export const POST = withErrorHandler(_POST)
