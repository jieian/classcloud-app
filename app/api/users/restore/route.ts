import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid } = await request.json();
  if (!uid) {
    return Response.json({ error: "Missing uid" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Clear soft-delete and reactivate the profile row
  const { error: updateError } = await adminClient
    .from("users")
    .update({ deleted_at: null, active_status: 1 })
    .eq("uid", uid);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Lift the auth ban
  const { error: unbanError } = await adminClient.auth.admin.updateUserById(
    uid,
    { ban_duration: "none" },
  );

  if (unbanError) {
    // Rollback: re-stamp deleted_at so the record isn't left in a broken state
    await adminClient
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("uid", uid);
    return Response.json({ error: unbanError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
