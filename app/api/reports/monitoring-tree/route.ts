import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { fetchReportMonitoringTree } from "@/lib/services/reportsAnalysisService";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  const tree = await fetchReportMonitoringTree(
    user.id,
    {
      canViewAll:
        permissions.includes("reports.view_all") ||
        permissions.includes("reports.approve"),
      canViewAssigned: permissions.includes("reports.view_assigned"),
      canMonitorGradeLevel: permissions.includes("reports.monitor_grade_level"),
      canMonitorSubjects: permissions.includes("reports.monitor_subjects"),
    },
    adminClient,
  );

  return Response.json(tree);
};

export const GET = withErrorHandler(_GET);
