import { promises as dns } from "dns";
import { sendVerificationEmail } from "@/lib/email/templates";
import { withErrorHandler } from "@/lib/api-error";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { adminClient } from "@/lib/supabase/admin";
import { generateRawToken, hashToken, encryptPassword } from "@/lib/crypto";

// 5 signup attempts per IP per 10 minutes
const signupLimiter = createRateLimiter({ maxRequests: 5, windowMs: 10 * 60_000 });

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_REQUIREMENTS = [
  (p: string) => p.length >= 6,
  (p: string) => /[0-9]/.test(p),
  (p: string) => /[a-z]/.test(p),
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[$&+,:;=?@#|'<>.^*()%!-]/.test(p),
];

async function domainHasMxRecords(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

const _POST = async function (request: Request) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = getClientIp(request);
  if (!(await signupLimiter.check(ip)).allowed) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "rate_limit_exceeded",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/signup",
      metadata: { endpoint: "/api/auth/signup" },
    });
    return Response.json(
      { error: "Too many signup attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  const body = await request.json();
  const { first_name, middle_name, last_name, email, password, role_ids, website, turnstile_token } = body;

  if (website) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "honeypot_triggered",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/signup",
      metadata: { endpoint: "/api/auth/signup" },
    });
    return Response.json({ success: true }, { status: 201 });
  }

  if (!turnstile_token || !(await verifyTurnstileToken(turnstile_token, ip))) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "turnstile_failed",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "POST /api/auth/signup",
      metadata: { endpoint: "/api/auth/signup" },
    });
    return Response.json(
      { error: "Security verification failed. Please refresh and try again." },
      { status: 400 },
    );
  }

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return Response.json({ error: "At least one role must be selected." }, { status: 400 });
  }

  // ── Email format + domain ─────────────────────────────────────────────────
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return Response.json({ error: "Invalid email format." }, { status: 400 });
  }
  if (!ALLOWED_DOMAINS.some((d) => trimmedEmail.endsWith(`@${d}`))) {
    return Response.json(
      { error: `Email must be a @${ALLOWED_DOMAINS.join(" or @")} address.` },
      { status: 400 },
    );
  }

  // ── Name length limits ────────────────────────────────────────────────────
  if (
    first_name.trim().length > 100 ||
    last_name.trim().length > 100 ||
    (middle_name && middle_name.trim().length > 100)
  ) {
    return Response.json({ error: "Name field is too long." }, { status: 400 });
  }

  // ── Password strength ─────────────────────────────────────────────────────
  if (!PASSWORD_REQUIREMENTS.every((test) => test(password))) {
    return Response.json(
      { error: "Password does not meet the required strength criteria." },
      { status: 400 },
    );
  }

  // ── Validate role IDs (must be self-registerable) ─────────────────────────
  const { data: validRoles, error: rolesError } = await adminClient
    .from("roles")
    .select("role_id")
    .eq("is_self_registerable", true)
    .in("role_id", role_ids);

  if (rolesError) {
    console.error("[signup] Role validation DB error:", rolesError.message);
    return Response.json({ error: "Failed to validate roles." }, { status: 500 });
  }
  if (!validRoles || validRoles.length !== role_ids.length) {
    return Response.json({ error: "One or more selected roles are invalid." }, { status: 400 });
  }

  // ── Check email status ────────────────────────────────────────────────────
  const { data: emailStatus, error: emailCheckError } = await adminClient.rpc(
    "check_email_status",
    { p_email: trimmedEmail, p_exclude_uid: null },
  );

  if (emailCheckError) {
    console.error("[signup] check_email_status error:", emailCheckError.message);
    return Response.json(
      { error: "Failed to verify email availability. Please try again." },
      { status: 500 },
    );
  }

  if (emailStatus?.status === "active") {
    return Response.json({ error: "This email is already registered." }, { status: 409 });
  }

  if (emailStatus?.status === "pending_verification") {
    return Response.json(
      { error: "A verification email was already sent to this address. Check your inbox.", code: "PENDING_VERIFICATION" },
      { status: 409 },
    );
  }

  // ── Resolve origin for email links ────────────────────────────────────────
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  // ── Determine path: new user or restore ───────────────────────────────────
  const isRestore = emailStatus?.status === "deleted";
  const restoreUid = isRestore ? (emailStatus.uid as string) : null;

  // ── DNS MX check (new users only — restored users' domain was already validated) ──
  if (!isRestore) {
    const domainValid = await domainHasMxRecords(trimmedEmail);
    if (!domainValid) {
      return Response.json(
        { error: `The domain for "${trimmedEmail}" does not appear to accept mail. Double-check the address.` },
        { status: 422 },
      );
    }
  }

  // ── Generate token + encrypt password ────────────────────────────────────
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const encryptedPw = encryptPassword(password);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // ── UPSERT into pending_registrations ────────────────────────────────────
  // ON CONFLICT (email): refresh token + data (handles race conditions and
  // re-submissions). resend_count resets to 0 on a fresh form submission.
  const { error: upsertError } = await adminClient.from("pending_registrations").upsert(
    {
      email:              trimmedEmail,
      token_hash:         tokenHash,
      encrypted_password: encryptedPw,
      first_name:         first_name.trim(),
      middle_name:        middle_name?.trim() || null,
      last_name:          last_name.trim(),
      role_ids,
      type:               isRestore ? "restore" : "new",
      restore_uid:        restoreUid,
      resend_count:       0,
      expires_at:         expiresAt,
    },
    { onConflict: "email" },
  );

  if (upsertError) {
    console.error("[signup] UPSERT error:", upsertError.message);
    return Response.json({ error: "Failed to process registration. Please try again." }, { status: 500 });
  }

  // ── Send verification email ───────────────────────────────────────────────
  const verificationLink = `${origin}/signup/confirmed?token=${rawToken}`;

  try {
    await sendVerificationEmail({
      to: trimmedEmail,
      verificationLink,
      firstName: first_name.trim(),
    });
  } catch (err) {
    console.error("[signup] Failed to send verification email:", err);
    // Roll back: remove the pending row so the email is not permanently locked
    await adminClient
      .from("pending_registrations")
      .delete()
      .eq("email", trimmedEmail)
      .then(null, (e) => console.error("CRITICAL: Failed to delete pending row after email failure:", e));

    return Response.json(
      {
        error: `The verification email could not be delivered to "${trimmedEmail}". Double-check the address.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  return Response.json({ success: true }, { status: 201 });
};

export const POST = withErrorHandler(_POST);
