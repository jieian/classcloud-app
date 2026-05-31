import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import type { GradeSubjectLeaderRow, SubjectLeaderEntry } from "@/app/(app)/school/faculty/_lib/facultyService";

type RpcRow = {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  curriculum_subject_id: number;
  subject_name: string;
  subject_description: string | null;
  subject_type: string;
  leader_uid: string | null;
  leader_first_name: string | null;
  leader_last_name: string | null;
};

const CACHE_KEY = "faculty:gsl";
const CACHE_TTL = 600;

const _GET = async function () {
  const supabase = await createServerSupabaseClient();

  const [{ data: { user } }, cached] = await Promise.all([
    supabase.auth.getUser(),
    redis.get<GradeSubjectLeaderRow[]>(CACHE_KEY),
  ]);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cached) return Response.json({ data: cached });

  const { data, error } = await adminClient.rpc("get_grade_subject_leader_data");

  if (error) {
    if (isRpcError(error, RpcError.NO_ACTIVE_SCHOOL_YEAR)) {
      return Response.json({ data: [] });
    }
    console.error("get_grade_subject_leader_data error:", error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const rows = (data ?? []) as RpcRow[];

  // Group flat rows by grade_level_id, preserving level_number order (RPC orders by level_number)
  const gradeMap = new Map<number, GradeSubjectLeaderRow>();
  for (const row of rows) {
    if (!gradeMap.has(row.grade_level_id)) {
      gradeMap.set(row.grade_level_id, {
        grade_level_id: row.grade_level_id,
        level_number: row.level_number,
        display_name: row.display_name,
        subjects: [],
      });
    }

    const entry: SubjectLeaderEntry = {
      curriculum_subject_id: row.curriculum_subject_id,
      grade_level_id: row.grade_level_id,
      subject_name: row.subject_name,
      subject_description: row.subject_description,
      subject_type: row.subject_type as "BOTH" | "SSES",
      leader:
        row.leader_uid
          ? {
              uid: row.leader_uid,
              first_name: row.leader_first_name!,
              last_name: row.leader_last_name!,
            }
          : null,
    };

    gradeMap.get(row.grade_level_id)!.subjects.push(entry);
  }

  const result = Array.from(gradeMap.values()).sort(
    (a, b) => a.level_number - b.level_number,
  );

  await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });
  return Response.json({ data: result });
};

export const GET = withErrorHandler(_GET);
