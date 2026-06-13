import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/students/check-lrn?lrn=…&exclude=… ──────────────────────────────
// LRN-collision pre-check for the Edit Student modal: does another student
// (excluding the one being edited) already hold this LRN? Replaces the
// browser-direct PostgREST read in classService.checkLrnExists.
// (Distinct from /api/classes/[sectionId]/students/check-lrn, which resolves
// enrollment status for the add-student flow.)

const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const lrn = (searchParams.get("lrn") ?? "").trim();
  const exclude = (searchParams.get("exclude") ?? "").trim();

  if (!/^\d{12}$/.test(lrn))
    return Response.json({ error: "Invalid LRN." }, { status: 400 });

  let query = admin.from("students").select("lrn").eq("lrn", lrn);
  if (exclude) query = query.neq("lrn", exclude);
  const { data, error } = await query.maybeSingle();

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ exists: data !== null });
};

export const GET = withErrorHandler(_GET);
