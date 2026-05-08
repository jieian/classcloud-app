import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _GET = async function (req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const excludeUid = searchParams.get("excludeUid") ?? null;

  if (!email) {
    return Response.json({ error: "Missing email parameter" }, { status: 400 });
  }

  const { data, error } = await adminClient.rpc("check_email_status", {
    p_email: email.trim(),
    p_exclude_uid: excludeUid,
  });

  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({ data });
};

export const GET = withErrorHandler(_GET);
