import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  // Verify the caller has a valid session (just confirmed their email)
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Idempotency: if the user already has a profile row, treat as success
  // (handles the case where the confirmation link is clicked more than once)
  const { data: existing } = await adminClient
    .from("users")
    .select("uid")
    .eq("uid", user.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ success: true });
  }

  // Read names from user_metadata (stored during signup link generation)
  const { first_name, middle_name, last_name } = user.user_metadata ?? {};

  if (!first_name || !last_name) {
    return Response.json(
      { error: "Account data is incomplete. Please sign up again." },
      { status: 400 },
    );
  }

  // Insert pending profile atomically
  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
    "register_user_atomic",
    {
      p_uid: user.id,
      p_first_name: first_name,
      p_middle_name: middle_name || "",
      p_last_name: last_name,
    },
  );

  if (rpcError) {
    console.error("register_user_atomic failed:", rpcError.message);
    return Response.json(
      { error: "Failed to complete registration. Please try again." },
      { status: 500 },
    );
  }

  if (rpcResult?.success === false) {
    return Response.json(
      { error: rpcResult.message || "Registration failed." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
