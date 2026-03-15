import { createClient } from "@supabase/supabase-js";
import { sendPasswordResetEmail } from "@/lib/email/templates";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return Response.json({ error: "Invalid email." }, { status: 400 });
  }

  const trimmedEmail = email.trim().toLowerCase();

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  // Generate a recovery link — also verifies the email exists in auth.users
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: trimmedEmail,
    options: {
      redirectTo: `${origin}/reset-password`,
    },
  });

  if (error || !data?.user || !data?.properties?.action_link) {
    return Response.json(
      { error: "No active account found with that email address." },
      { status: 404 },
    );
  }

  // Check public.users: must be active and not soft-deleted
  const { data: publicUser } = await adminClient
    .from("users")
    .select("active_status, deleted_at")
    .eq("uid", data.user.id)
    .maybeSingle();

  if (!publicUser || publicUser.active_status !== 1 || publicUser.deleted_at) {
    return Response.json(
      { error: "No active account found with that email address." },
      { status: 404 },
    );
  }

  // Send reset email via Nodemailer
  try {
    await sendPasswordResetEmail({
      to: trimmedEmail,
      resetLink: data.properties.action_link,
    });
  } catch {
    return Response.json(
      { error: "Failed to send the reset email. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
