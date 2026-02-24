import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: caller.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: { permission_name: string }) =>
        p.permission_name === "access_subject_management",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const code = body?.code?.trim();

  if (!code) {
    return Response.json({ error: "Subject code is required." }, { status: 400 });
  }

  const { count: dupCount, error: dupError } = await adminClient
    .from("subjects")
    .select("subject_id", { count: "exact", head: true })
    .ilike("code", code)
    .is("deleted_at", null);

  if (dupError) {
    return Response.json({ error: dupError.message }, { status: 500 });
  }

  if ((dupCount ?? 0) > 0) {
    return Response.json(
      {
        available: false,
        error: "A subject with this code already exists.",
      },
      { status: 409 },
    );
  }

  return Response.json({ available: true }, { status: 200 });
}
