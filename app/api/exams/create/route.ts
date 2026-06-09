import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
import { EXAMS_CACHE_TAG } from "@/app/(app)/exam/_lib/examServerService";
function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

const _POST = async function (request: Request) {
  // Verify the caller is authenticated
  const user = await getServerUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.limited_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { payload, sectionIds } = await request.json();

  // ── Pure validation (no DB) — fail fast before spending any round-trip ──────
  const selectedSectionIds = Array.isArray(sectionIds)
    ? sectionIds
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  if (selectedSectionIds.length === 0) {
    return Response.json({ error: "At least one section is required" }, { status: 400 });
  }
  if (!payload.curriculum_subject_id) {
    return Response.json({ error: "Subject is required." }, { status: 400 });
  }
  if (!payload.quarter_id) {
    return Response.json(
      { error: "No active term found. Please activate a term before creating an exam." },
      { status: 400 },
    );
  }

  // ── Pre-checks: independent reads run concurrently (latency win) ────────────
  const [activeTerm, myAssignmentsRes, sectionRes, dupRes] = await Promise.all([
    // Active-term guard: if there is an active SY, it must have ≥1 active quarter.
    (async () => {
      const { data: activeSy } = await adminClient
        .from("school_years")
        .select("sy_id")
        .eq("is_active", true)
        .maybeSingle();
      if (!activeSy?.sy_id) return { ok: true };
      const { count } = await adminClient
        .from("quarters")
        .select("quarter_id", { count: "exact", head: true })
        .eq("sy_id", activeSy.sy_id)
        .eq("is_active", true);
      return { ok: (count ?? 0) > 0 };
    })(),
    adminClient
      .from("teacher_class_assignments")
      .select("section_id")
      .eq("teacher_id", user.id)
      .is("deleted_at", null),
    adminClient
      .from("sections")
      .select("section_id, name, grade_levels(level_number)")
      .in("section_id", selectedSectionIds),
    adminClient
      .from("exam_assignments")
      .select("section_id, exams!inner(curriculum_subject_id, quarter_id, deleted_at)")
      .in("section_id", selectedSectionIds)
      .eq("exams.curriculum_subject_id", payload.curriculum_subject_id)
      .eq("exams.quarter_id", payload.quarter_id)
      .is("exams.deleted_at", null),
  ]);

  if (!activeTerm.ok) {
    return Response.json(
      {
        error:
          "No active term is configured for the current school year. Please activate a term before creating an exam.",
      },
      { status: 400 },
    );
  }

  if (myAssignmentsRes.error || sectionRes.error || dupRes.error) {
    console.error(
      "[api/exams/create] pre-check error:",
      myAssignmentsRes.error?.message ?? sectionRes.error?.message ?? dupRes.error?.message,
    );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const myAssignments = myAssignmentsRes.data;
  const sectionRows = sectionRes.data;
  const existingDuplications = dupRes.data;

  // Verify all selected sections are assigned to the authenticated teacher
  const mySectionIds = new Set(
    (myAssignments ?? []).map((a: { section_id: number | null }) => a.section_id).filter(Boolean),
  );
  if (selectedSectionIds.find((id) => !mySectionIds.has(id)) !== undefined) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // All selected sections must belong to the same grade level
  const levelNumbers = new Set<number>();
  for (const row of (sectionRows ?? []) as Array<{
    grade_levels: { level_number: number } | { level_number: number }[] | null;
  }>) {
    const gl = row.grade_levels;
    const level = Array.isArray(gl) ? gl[0]?.level_number : gl?.level_number;
    if (typeof level === "number") levelNumbers.add(level);
  }
  if (levelNumbers.size > 1) {
    return Response.json(
      { error: "Selected sections must belong to the same grade level." },
      { status: 400 },
    );
  }
  const gradeLevelNumber = levelNumbers.size === 1 ? [...levelNumbers][0] : null;
  const resolvedTotalItems = getAutoTotalItems(gradeLevelNumber);

  // Drop sections that already have an exam for this subject + term
  const existingSectionIds = new Set<number>(
    (existingDuplications ?? []).map((row: any) => row.section_id),
  );
  const nonDuplicateSectionIds = selectedSectionIds.filter((id) => !existingSectionIds.has(id));
  if (nonDuplicateSectionIds.length === 0) {
    return Response.json(
      {
        error:
          "An examination for this subject, grade level, and section already exists for the active term.",
      },
      { status: 400 },
    );
  }
  const skippedSectionIds = selectedSectionIds.filter((id) => existingSectionIds.has(id));

  // Build per-section titles for the bulk insert.
  const sectionNameMap = new Map<number, string>(
    (sectionRows ?? []).map((r: any) => [r.section_id as number, r.name as string]),
  );
  const examsToCreate = nonDuplicateSectionIds.map((sectionId) => {
    const sectionName = sectionNameMap.get(sectionId) ?? String(sectionId);
    const title = payload.skipSectionSuffix
      ? payload.title
      : `${payload.title} - ${sectionName}${payload.titleSuffix ? ` ${payload.titleSuffix}` : ""}`;
    return { section_id: sectionId, title };
  });

  // ── Single atomic bulk write (was 2 round-trips per section + JS rollback) ──
  const { data: created, error: createError } = await adminClient.rpc("create_exams_for_sections", {
    p_creator_teacher_id: user.id,
    p_curriculum_subject_id: payload.curriculum_subject_id,
    p_quarter_id: payload.quarter_id,
    p_exam_date: payload.exam_date,
    p_total_items: resolvedTotalItems,
    p_description: payload.description ?? null,
    p_sections: examsToCreate,
  });

  if (createError) {
    console.error("[api/exams/create] bulk create error:", createError.message);
    return Response.json({ error: "Failed to create exam." }, { status: 500 });
  }

  const createdExamIds = ((created ?? []) as { exam_id: number }[]).map((r) => r.exam_id);

  revalidateTag(EXAMS_CACHE_TAG, "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "exam_created",
      entity_type: "exam",
      entity_id: String(createdExamIds[0] ?? ""),
      entity_label: payload.title,
      // subject/quarter names deferred — would require a read.
      new_values: {
        title: payload.title,
        curriculum_subject_id: payload.curriculum_subject_id,
        quarter_id: payload.quarter_id,
        section_count: examsToCreate.length,
      },
      metadata: { exam_ids: createdExamIds },
    }).catch(() => {}),
  );

  return Response.json({
    exam_ids: createdExamIds,
    skipped_sections: skippedSectionIds.length > 0 ? skippedSectionIds : undefined,
  });
};

export const POST = withErrorHandler(_POST);
