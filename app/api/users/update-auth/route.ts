import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  // Verify caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller has user management permission
  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("access_user_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { uid, email, password } = await request.json();

  if (!uid || typeof uid !== "string") {
    return Response.json({ error: "Invalid user UID" }, { status: 400 });
  }

  // Build update payload — only include fields that were provided
  const updatePayload: { email?: string; password?: string } = {};

  if (email && typeof email === "string") {
    updatePayload.email = email;
  }
  if (password && typeof password === "string") {
    updatePayload.password = password;
  }

  if (Object.keys(updatePayload).length === 0) {
    return Response.json(
      { error: "No email or password provided to update" },
      { status: 400 },
    );
  }

  // Admin client with service role key
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await adminClient.auth.admin.updateUserById(
    uid,
    updatePayload,
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
