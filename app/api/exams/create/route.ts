import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

const _POST = async function(request: Request) {
  // Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { payload, sectionIds } = await request.json();

  // Guard: require at least one quarter in the active school year
  const { data: activeSy } = await adminClient
    .from('school_years')
    .select('sy_id')
    .eq('is_active', true)
    .maybeSingle();

  if (activeSy?.sy_id) {
    const { count } = await adminClient
      .from('quarters')
      .select('quarter_id', { count: 'exact', head: true })
      .eq('sy_id', activeSy.sy_id)
      .eq('is_active', true);

    if ((count ?? 0) === 0) {
      return Response.json(
        { error: 'No active term is configured for the current school year. Please activate a term before creating an exam.' },
        { status: 400 },
      );
    }
  }

  // Use service role to bypass RLS

  const selectedSectionIds = Array.isArray(sectionIds)
    ? sectionIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  if (selectedSectionIds.length === 0) {
    return Response.json({ error: "At least one section is required" }, { status: 400 });
  }

  const { data: sectionRows, error: sectionError } = await adminClient
    .from("sections")
    .select("section_id, name, grade_levels(level_number)")
    .in("section_id", selectedSectionIds);

  if (sectionError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const levelNumbers = new Set<number>();
  for (const row of (sectionRows ?? []) as Array<{ grade_levels: { level_number: number } | { level_number: number }[] | null }>) {
    const gl = row.grade_levels;
    const level =
      Array.isArray(gl) ? gl[0]?.level_number : gl?.level_number;
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

  const creatorTeacherId = payload.creator_teacher_id ?? user.id;

  // Ensure no duplicate (section + subject + term) exam already exists.
  if (!payload.curriculum_subject_id) {
    return Response.json({ error: "Subject is required." }, { status: 400 });
  }

  if (!payload.quarter_id) {
    return Response.json({ error: "No active term found. Please activate a term before creating an exam." }, { status: 400 });
  }

  const { data: existingDuplications, error: dupError } = await adminClient
    .from("exam_assignments")
    .select("section_id, exams!inner(curriculum_subject_id, quarter_id, deleted_at)")
    .in("section_id", selectedSectionIds)
    .eq("exams.curriculum_subject_id", payload.curriculum_subject_id)
    .eq("exams.quarter_id", payload.quarter_id)
    .is("exams.deleted_at", null);

  if (dupError) {
    console.error("[api/exams/create] duplicate check error:", dupError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const existingSectionIds = new Set<number>((existingDuplications ?? []).map((row: any) => row.section_id));
  const nonDuplicateSectionIds = selectedSectionIds.filter((id) => !existingSectionIds.has(id));

  if (nonDuplicateSectionIds.length === 0) {
    return Response.json(
      { error: "An examination for this subject, grade level, and section already exists for the active term." },
      { status: 400 },
    );
  }

  const skippedSectionIds = selectedSectionIds.filter((id) => existingSectionIds.has(id));

  // Build a lookup so we can generate per-section titles.
  const sectionNameMap = new Map<number, string>(
    (sectionRows ?? []).map((r: any) => [r.section_id as number, r.name as string])
  );

  // Create one independent exam per section.
  const createdExamIds: number[] = [];
  for (const sectionId of nonDuplicateSectionIds) {
    const sectionName = sectionNameMap.get(sectionId) ?? String(sectionId);
    const examTitle = payload.skipSectionSuffix
      ? payload.title
      : `${payload.title} - ${sectionName}${payload.titleSuffix ? ` ${payload.titleSuffix}` : ''}`;

    const { data: examRow, error: examError } = await adminClient
      .from("exams")
      .insert({
        title: examTitle,
        total_items: resolvedTotalItems,
        exam_date: payload.exam_date,
        curriculum_subject_id: payload.curriculum_subject_id,
        quarter_id: payload.quarter_id ?? null,
        description: payload.description ?? null,
        creator_teacher_id: creatorTeacherId,
      })
      .select("exam_id")
      .single();

    if (examError || !examRow?.exam_id) {
      console.error("[api/exams/create] exam insert error:", examError?.message);
      // Roll back any exams already created in this batch.
      if (createdExamIds.length > 0) {
        await adminClient.from("exams").delete().in("exam_id", createdExamIds);
      }
      return Response.json({ error: "Failed to create exam." }, { status: 500 });
    }

    const { error: assignmentError } = await adminClient
      .from("exam_assignments")
      .insert({ exam_id: examRow.exam_id, section_id: sectionId });

    if (assignmentError) {
      console.error("[api/exams/create] assignment insert error:", assignmentError.message);
      await adminClient.from("exams").delete().in("exam_id", [...createdExamIds, examRow.exam_id]);
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    createdExamIds.push(examRow.exam_id);
  }

  return Response.json({
    exam_ids: createdExamIds,
    skipped_sections: skippedSectionIds.length > 0 ? skippedSectionIds : undefined,
  });
}

export const POST = withErrorHandler(_POST)
