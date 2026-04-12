import { sendVerificationEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-error";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { generateRawToken, hashToken } from "@/lib/crypto";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 3 resends per email per 15 minutes
const resendEmailLimiter = createRateLimiter({ maxRequests: 3, windowMs: 15 * 60_000 });
// 10 resend attempts per IP per minute (prevents enumeration)
const resendIpLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

const _POST = async function (request: Request) {
  // ── Rate limit by IP ──────────────────────────────────────────────────────
  const ip = getClientIp(request);
  if (!resendIpLimiter.check(ip).allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  const body = await request.json();
  const email = body?.email?.trim()?.toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return Response.json({ error: "Invalid email." }, { status: 400 });
  }
  if (!ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`))) {
    return Response.json({ error: "Invalid email domain." }, { status: 400 });
  }

  // ── Rate limit by email ───────────────────────────────────────────────────
  if (!resendEmailLimiter.check(email).allowed) {
    return Response.json({ error: "Too many resend attempts for this email. Please wait before trying again." }, { status: 429 });
  }

  // ── Look up pending row ───────────────────────────────────────────────────
  const { data: row, error: fetchError } = await adminClient
    .from("pending_registrations")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (fetchError) {
    console.error("[resend] DB fetch error:", fetchError.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  if (!row) {
    return Response.json(
      { error: "No pending registration found for this email. Please sign up again.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── Max resends check ─────────────────────────────────────────────────────
  if (row.resend_count >= 3) {
    // Delete the row — user must start over
    await adminClient
      .from("pending_registrations")
      .delete()
      .eq("email", email)
      .then(null, (e) => console.error("[resend] Failed to delete row at max resends:", e));

    return Response.json(
      { error: "You've reached the maximum number of resends. Please sign up again.", code: "MAX_RESENDS_EXCEEDED" },
      { status: 429 },
    );
  }

  // ── Generate new token + refresh expiry ──────────────────────────────────
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const { error: updateError } = await adminClient
    .from("pending_registrations")
    .update({
      token_hash: tokenHash,
      resend_count: row.resend_count + 1,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("email", email);

  if (updateError) {
    console.error("[resend] DB update error:", updateError.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // ── Send new verification email ───────────────────────────────────────────
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin;

  const verificationLink = `${origin}/signup/confirmed?token=${rawToken}`;

  try {
    await sendVerificationEmail({
      to: email,
      verificationLink,
      firstName: row.first_name,
    });
  } catch (err) {
    console.error("[resend] Failed to send email:", err);
    return Response.json(
      {
        error: `The verification email could not be delivered to "${email}". Double-check the address.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
