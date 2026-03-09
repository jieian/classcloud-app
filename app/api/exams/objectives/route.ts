import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SaveObjectivesBody = {
  examId?: number;
  objectives?: { objective: string; start_item: number; end_item: number }[];
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveObjectivesBody;
  const { examId, objectives } = body;

  if (!examId || !objectives) {
    return Response.json({ error: "Missing examId or objectives" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await adminClient
    .from("exams")
    .update({ objectives })
    .eq("exam_id", examId)
    .select("exam_id");

  if (error) {
    console.error("[api/exams/objectives] update error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ error: "No exam rows updated" }, { status: 404 });
  }

  return Response.json({ exam_id: data[0].exam_id });
}
