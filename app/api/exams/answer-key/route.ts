import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SaveAnswerKeyBody = {
  examId?: number;
  answerKey?: {
    total_questions: number;
    num_choices: number;
    answers: Record<number, string | null>;
  };
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveAnswerKeyBody;
  const examId = body.examId;
  const answerKey = body.answerKey;

  if (!examId || !answerKey) {
    return Response.json({ error: "Missing examId or answerKey" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await adminClient
    .from("exams")
    .update({ answer_key: answerKey })
    .eq("exam_id", examId)
    .select("exam_id");

  if (error) {
    console.error("[api/exams/answer-key] update error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ error: "No exam rows updated" }, { status: 404 });
  }

  return Response.json({ exam_id: data[0].exam_id });
}
