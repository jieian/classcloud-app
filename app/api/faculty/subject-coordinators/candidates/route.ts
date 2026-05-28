import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import type { FacultyMember } from "@/app/(app)/school/faculty/_lib/facultyService";
import { redis } from "@/lib/redis";

const CACHE_KEY = "faculty:candidates";
const CACHE_TTL = 600;

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cached = await redis.get<FacultyMember[]>(CACHE_KEY);
  if (cached) return Response.json({ data: cached });

  // Parallel: all faculty + current coordinators in the active SY
  const [facultyResult, coordinatorResult] = await Promise.all([
    adminClient.rpc("get_faculty_list"),
    adminClient
      .from("subject_coordinators")
      .select("user_id, school_years!sy_id(is_active)")
      .eq("school_years.is_active", true)
      .is("deleted_at", null),
  ]);

  if (facultyResult.error) {
    console.error("get_faculty_list error:", facultyResult.error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if (coordinatorResult.error) {
    console.error("subject_coordinators fetch error:", coordinatorResult.error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  // Build a set of uids already acting as coordinator in the active SY.
  // The PostgREST inner-join filter returns only rows where school_years.is_active = true.
  const coordinatorUids = new Set<string>(
    (coordinatorResult.data ?? [])
      .filter((row) => row.school_years !== null)
      .map((row) => row.user_id as string),
  );

  const candidates = ((facultyResult.data as FacultyMember[]) ?? []).filter(
    (f) => !coordinatorUids.has(f.uid),
  );

  await redis.set(CACHE_KEY, candidates, { ex: CACHE_TTL });
  return Response.json({ data: candidates });
};

export const GET = withErrorHandler(_GET);
