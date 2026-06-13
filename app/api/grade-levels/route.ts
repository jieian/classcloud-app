import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getGradeLevelsCached } from "@/app/(app)/school/classes/_lib/classesServerService";

// ─── GET /api/grade-levels ────────────────────────────────────────────────────
// Grade-level reference list for client pages (exam create/copy modals, etc.).
// Served from the Next.js data cache (tag: grade-levels) — replaces the
// browser-direct PostgREST read in gradeLevelService.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const gradeLevels = await getGradeLevelsCached();
  return Response.json({ gradeLevels });
};

export const GET = withErrorHandler(_GET);
