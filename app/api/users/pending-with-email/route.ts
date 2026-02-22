import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: pendingUsers, error: usersError } = await adminClient
    .from("users")
    .select("uid, first_name, middle_name, last_name")
    .eq("active_status", 0)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (usersError) {
    return Response.json({ error: usersError.message }, { status: 500 });
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers();
  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 });
  }

  const emailByUid = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const data = (pendingUsers ?? []).map((u) => ({
    uid: u.uid,
    first_name: u.first_name,
    middle_name: u.middle_name,
    last_name: u.last_name,
    email: emailByUid.get(u.uid) ?? "",
  }));

  return Response.json({ data });
}
