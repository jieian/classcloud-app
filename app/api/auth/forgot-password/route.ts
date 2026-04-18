import { sendPasswordResetEmail } from "@/lib/email/templates";

import { withErrorHandler } from "@/lib/api-error";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { adminClient } from "@/lib/supabase/admin";
// 5 password-reset requests per IP per 15 minutes
const resetLimiter = createRateLimiter({ maxRequests: 5, windowMs: 15 * 60_000 });

const _POST = async function(request: Request) {
  const ip = getClientIp(request);
  const limit = await resetLimiter.check(ip);
  if (!limit.allowed) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "rate_limit_exceeded",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/forgot-password",
      metadata: { endpoint: "/api/auth/forgot-password" },
    });
    return Response.json(
      { error: "Too many password reset requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const { email, website, turnstile_token } = await request.json();

  if (website) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "honeypot_triggered",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/forgot-password",
      metadata: { endpoint: "/api/auth/forgot-password" },
    });
    return Response.json({ success: true });
  }

  if (!email || typeof email !== "string") {
    return Response.json({ error: "Invalid email." }, { status: 400 });
  }

  if (!turnstile_token || !(await verifyTurnstileToken(turnstile_token, ip))) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "turnstile_failed",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/forgot-password",
      metadata: { endpoint: "/api/auth/forgot-password" },
    });
    return Response.json(
      { error: "Security verification failed. Please refresh and try again." },
      { status: 400 },
    );
  }

  const trimmedEmail = email.trim().toLowerCase();


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
      redirectTo: `${origin}/reset-password?email=${encodeURIComponent(trimmedEmail)}`,
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

export const POST = withErrorHandler(_POST)
