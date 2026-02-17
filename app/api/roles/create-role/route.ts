import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
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
  if (!permissions.includes("access_role_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. PAYLOAD: Parse role data
  const body = await request.json();
  const { name, permission_ids } = body;

  if (!name || !permission_ids || !Array.isArray(permission_ids)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
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

  // 5. RPC: Create role + assign permissions in a single atomic transaction
  const { data, error } = await adminClient.rpc(
    "create_role_with_permissions",
    {
      role_name: name.trim(),
      p_ids: permission_ids,
    }
  );

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A role with this name already exists." },
        { status: 409 }
      );
    }
    console.error("Role Creation Failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, role_id: data }, { status: 201 });
}
