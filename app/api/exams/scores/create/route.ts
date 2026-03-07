import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type CreateScoreBody = {
  enrollment_id?: number;
  exam_assignment_id?: number;
  responses?: Record<number, string>;
  calculated_score?: number;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateScoreBody;
  const enrollmentId = Number(body.enrollment_id);
  const examAssignmentId = Number(body.exam_assignment_id);
  const calculatedScore = Number(body.calculated_score);
  const responses = body.responses ?? {};

  if (!enrollmentId || !examAssignmentId || Number.isNaN(calculatedScore)) {
    return Response.json(
      { error: "Missing or invalid enrollment_id, exam_assignment_id, or calculated_score" },
      { status: 400 },
    );
  }

  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return Response.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const adminClient = createClient(url, serviceRoleKey);

  const gradedAt = new Date().toISOString();
  const { data, error } = await adminClient.rpc("create_score", {
    p_enrollment_id: enrollmentId,
    p_exam_assignment_id: examAssignmentId,
    p_responses: responses,
    p_calculated_score: calculatedScore,
    p_graded_at: gradedAt,
  });

  if (error) {
    console.error("[api/exams/scores/create] rpc create_score error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Support several RPC return shapes:
  // 1) full row
  // 2) array with row
  // 3) score_id only
  // 4) void/null (fallback query by latest graded_at for this assignment+enrollment)
  let scoreId: number | null = null;
  if (typeof data === "number") {
    scoreId = data;
  } else if (Array.isArray(data) && typeof data[0] === "number") {
    scoreId = data[0];
  } else if (data && typeof data === "object") {
    if ("score_id" in data && typeof data.score_id === "number") {
      scoreId = data.score_id;
    } else if (Array.isArray(data) && data[0] && typeof data[0] === "object" && "score_id" in data[0]) {
      scoreId = typeof data[0].score_id === "number" ? data[0].score_id : null;
    }
  }

  let score: {
    score_id: number;
    enrollment_id: number | null;
    exam_assignment_id: number;
    responses: Record<number, string>;
    calculated_score: number;
    graded_at: string;
  } | null = null;

  if (data && typeof data === "object" && !Array.isArray(data) && "score_id" in data) {
    score = data as typeof score;
  } else if (Array.isArray(data) && data[0] && typeof data[0] === "object" && "score_id" in data[0]) {
    score = data[0] as typeof score;
  } else if (scoreId != null) {
    const { data: fetched, error: fetchError } = await adminClient
      .from("scores")
      .select("score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at")
      .eq("score_id", scoreId)
      .single();
    if (fetchError) {
      return Response.json({ error: fetchError.message }, { status: 500 });
    }
    score = fetched;
  } else {
    const { data: fetched, error: fetchError } = await adminClient
      .from("scores")
      .select("score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at")
      .eq("enrollment_id", enrollmentId)
      .eq("exam_assignment_id", examAssignmentId)
      .order("graded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchError) {
      return Response.json({ error: fetchError.message }, { status: 500 });
    }
    score = fetched;
  }

  if (!score) {
    return Response.json({ error: "Score saved via RPC but no row was returned" }, { status: 500 });
  }

  return Response.json({ score }, { status: 201 });
}
