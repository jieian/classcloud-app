import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: caller.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: { permission_name: string }) =>
        p.permission_name === "curriculum.full_access",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const code = body?.code?.trim();

  if (!code) {
    return Response.json({ error: "Subject code is required." }, { status: 400 });
  }

  const { data: existing, error: dupError } = await adminClient
    .from("subjects")
    .select("subject_id, code, name, description, subject_type")
    .ilike("code", code)
    .is("deleted_at", null)
    .limit(1);

  if (dupError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if ((existing?.length ?? 0) > 0) {
    return Response.json(
      { available: false, existingSubject: existing![0] },
      { status: 409 },
    );
  }

  return Response.json({ available: true }, { status: 200 });
}

export const POST = withErrorHandler(_POST)
