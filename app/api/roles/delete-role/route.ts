import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  // 1. SECURITY: Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. PERMISSIONS: Verify caller has the right to manage roles
  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("access_user_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse role data
  const body = await request.json();
  const { role_id } = body;

  if (!role_id || typeof role_id !== "number") {
    return Response.json({ error: "Missing or invalid role_id" }, { status: 400 });
  }

  // 4. ADMIN CLIENT: Initialize with Service Role Key (Bypasses RLS)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // 5. GUARD: Ensure the role is not assigned to any users
  const { count, error: countError } = await adminClient
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", role_id);

  if (countError) {
    console.error("Role attachment check failed:", countError.message);
    return Response.json({ error: "Failed to verify role status." }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return Response.json(
      { error: "Cannot delete role that is assigned to users." },
      { status: 409 }
    );
  }

  // 6. DELETE: Remove the role (ON DELETE CASCADE handles role_permissions)
  const { error } = await adminClient
    .from("roles")
    .delete()
    .eq("role_id", role_id);

  if (error) {
    console.error("Role Deletion Failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
