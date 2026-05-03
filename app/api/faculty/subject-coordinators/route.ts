import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();

  const [{ data: { user } }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    adminClient.rpc("get_subject_coordinator_groups"),
  ]);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error) {
    console.error("get_subject_coordinator_groups error:", error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
};

export const GET = withErrorHandler(_GET);
