import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { fetchMyAssignedScope } from "@/lib/services/reportsAnalysisService";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = await fetchMyAssignedScope(user.id, adminClient);
  return Response.json(scope);
};

export const GET = withErrorHandler(_GET);
