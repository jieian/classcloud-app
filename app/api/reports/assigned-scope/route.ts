import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getAssignedScopeForUser } from "@/lib/services/userAssignmentsCache";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);

  const scope = await getAssignedScopeForUser(user.id, {
    needsGlSections: permissions.includes("reports.monitor_grade_level"),
    needsSubjectSections: permissions.includes("reports.monitor_subjects"),
  });

  return Response.json(scope);
};

export const GET = withErrorHandler(_GET);
