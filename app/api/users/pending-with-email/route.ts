import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _GET = async function() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  const { data, error } = await adminClient.rpc("get_pending_users_with_details");

  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}

export const GET = withErrorHandler(_GET)
