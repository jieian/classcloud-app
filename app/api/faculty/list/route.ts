import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();

  const [authResult, rpcResult] = await Promise.all([
    supabase.auth.getUser(),
    adminClient.rpc("get_faculty_list"),
  ]);

  if (!authResult.data.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (rpcResult.error) {
    console.error("get_faculty_list error:", rpcResult.error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const raw = (rpcResult.data ?? []) as { uid: string }[];
  const seen = new Set<string>();
  const data = raw.filter((m) => {
    if (seen.has(m.uid)) return false;
    seen.add(m.uid);
    return true;
  });

  return Response.json({ data });
};

export const GET = withErrorHandler(_GET);
