import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getSchoolYearsCached } from "@/app/(app)/school/classes/_lib/classesServerService";

// ─── GET /api/school-years ────────────────────────────────────────────────────
// School-year list for client pages (exam create, etc.). Served from the
// Next.js data cache (tag: school-years, revalidated by schoolYear mutation
// routes) — replaces the browser-direct PostgREST read in classService.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const schoolYears = await getSchoolYearsCached();
  return Response.json({ schoolYears });
};

export const GET = withErrorHandler(_GET);
