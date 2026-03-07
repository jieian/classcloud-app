import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

export async function POST(request: Request) {
  // Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { payload, sectionIds } = await request.json();

  // Use service role to bypass RLS
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const selectedSectionIds = Array.isArray(sectionIds)
    ? sectionIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];

  if (selectedSectionIds.length === 0) {
    return Response.json({ error: "At least one section is required" }, { status: 400 });
  }

  const { data: sectionRows, error: sectionError } = await adminClient
    .from("sections")
    .select("section_id, grade_levels(level_number)")
    .in("section_id", selectedSectionIds);

  if (sectionError) {
    return Response.json({ error: sectionError.message }, { status: 500 });
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

  const { data: examRow, error: examError } = await adminClient
    .from("exams")
    .insert({
      title: payload.title,
      total_items: resolvedTotalItems,
      exam_date: payload.exam_date,
      subject_id: payload.subject_id ?? null,
      quarter_id: payload.quarter_id ?? null,
      description: payload.description ?? null,
      creator_teacher_id: creatorTeacherId,
    })
    .select("exam_id")
    .single();

  if (examError || !examRow?.exam_id) {
    console.error("[api/exams/create] exam insert error:", examError?.message);
    return Response.json({ error: examError?.message ?? "Failed to create exam" }, { status: 500 });
  }

  const assignments = selectedSectionIds.map((sectionId) => ({
    exam_id: examRow.exam_id,
    section_id: sectionId,
  }));

  const { error: assignmentError } = await adminClient
    .from("exam_assignments")
    .insert(assignments);

  if (assignmentError) {
    console.error("[api/exams/create] assignment insert error:", assignmentError.message);
    await adminClient.from("exams").delete().eq("exam_id", examRow.exam_id);
    return Response.json({ error: assignmentError.message }, { status: 500 });
  }

  return Response.json({ exam_id: examRow.exam_id });
}
