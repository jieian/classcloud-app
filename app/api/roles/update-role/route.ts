import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  // 1. SECURITY: Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. ADMIN CLIENT: Initialize with Service Role Key (Bypasses RLS)
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

  // 3. PERMISSIONS: Verify caller has the right to manage roles (via admin client to bypass RLS)
  console.log("=== PERMISSIONS CHECK ===");
  const { data: permsData, error: permsError } = await adminClient.rpc("get_user_permissions", {
    user_uuid: caller.id,
  });

  const hasPermission = permsData?.some(
    (p: any) => p.permission_name === "access_user_management"
  );

  if (permsError || !permsData?.some((p: any) => p.permission_name === "access_user_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. PAYLOAD: Parse role data
  const body = await request.json();
  const { role_id, name, permission_ids } = body;

  if (!role_id || !name || !permission_ids || !Array.isArray(permission_ids)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. RPC: Update role + reassign permissions in a single atomic transaction
  const { error } = await adminClient.rpc("update_role_and_permissions", {
    p_role_id: role_id,
    p_name: name.trim(),
    p_permission_ids: permission_ids,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A role with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Role Update Failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
