import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await adminClient
    .from("roles")
    .select("role_id, name, is_faculty")
    .eq("is_self_registerable", true)
    .order("name");

  if (error) {
    return Response.json({ error: "Failed to load roles." }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}
