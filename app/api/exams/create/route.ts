import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  const creatorTeacherId = payload.creator_teacher_id ?? user.id;

  const { data: examRow, error: examError } = await adminClient
    .from("exams")
    .insert({
      title: payload.title,
      total_items: payload.total_items,
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

  const assignments = (sectionIds as number[]).map((sectionId) => ({
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
