import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase();

  if (!email || !ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`))) {
    return Response.json({ error: "Invalid email." }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await adminClient.rpc("check_email_status", {
    p_email: email,
    p_exclude_uid: null,
  });

  if (error) {
    return Response.json({ error: "Failed to check email." }, { status: 500 });
  }

  return Response.json(data);
}
