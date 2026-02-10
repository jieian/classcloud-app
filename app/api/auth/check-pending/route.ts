import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return Response.json({ pending: false });
  }

  // Use service role to bypass RLS
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await adminClient
    .from("users")
    .select("active_status")
    .eq("email", email.trim())
    .eq("active_status", 0)
    .maybeSingle();

  return Response.json({ pending: !!data });
}
