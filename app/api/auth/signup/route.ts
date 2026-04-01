import { promises as dns } from "dns";
import { sendVerificationEmail } from "@/lib/email/templates";

import { withErrorHandler } from "@/lib/api-error";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

import { adminClient } from "@/lib/supabase/admin";
// 5 signup attempts per IP per 10 minutes
const signupLimiter = createRateLimiter({ maxRequests: 5, windowMs: 10 * 60_000 });

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com"];
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

const _POST = async function(request: Request) {
  // Rate limit: 5 signup attempts per IP per 10 minutes
  const ip = getClientIp(request);
  const limit = signupLimiter.check(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many signup attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  // --- PARSE & VALIDATE ---
  const body = await request.json();
  const { first_name, middle_name, last_name, email, password, role_ids } = body;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return Response.json({ error: "At least one role must be selected." }, { status: 400 });
  }

  // --- EMAIL FORMAT & DOMAIN ---
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return Response.json({ error: "Invalid email format." }, { status: 400 });
  }
  const domainAllowed = ALLOWED_DOMAINS.some((d) => trimmedEmail.endsWith(`@${d}`));
  if (!domainAllowed) {
    return Response.json(
      { error: `Email must be a @${ALLOWED_DOMAINS.join(" or @")} address.` },
      { status: 400 },
    );
  }

  // --- NAME LENGTHS ---
  if (
    first_name.trim().length > 100 ||
    last_name.trim().length > 100 ||
    (middle_name && middle_name.trim().length > 100)
  ) {
    return Response.json({ error: "Name field is too long." }, { status: 400 });
  }

  // --- PASSWORD (server-side re-validation) ---
  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((test) => test(password));
  if (!allRequirementsMet) {
    return Response.json(
      { error: "Password does not meet the required strength criteria." },
      { status: 400 },
    );
  }

  // --- VALIDATE ROLE IDS (must be self-registrable) ---
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
    console.error("[signup] Invalid role_ids submitted:", role_ids);
    return Response.json(
      { error: "One or more selected roles are invalid." },
      { status: 400 },
    );
  }

  // --- CHECK EMAIL STATUS ---
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

  // Resolve base URL for redirect links
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin);

  // --- RESTORE PATH ---
  if (emailStatus?.status === "deleted") {
    const uid = emailStatus.uid as string;
    const restoreToken = crypto.randomUUID();

    const { error: updateError } = await adminClient.auth.admin.updateUserById(uid, {
      password,
      user_metadata: {
        first_name: first_name.trim(),
        middle_name: middle_name?.trim() || "",
        last_name: last_name.trim(),
        role_ids,
        restore_token: restoreToken,
      },
    });

    if (updateError) {
      console.error("[signup] Failed to update auth user for restore:", updateError.message);
      return Response.json(
        { error: "Failed to process registration. Please try again." },
        { status: 500 },
      );
    }

    const restoreLink = `${origin}/signup/confirmed?token=${restoreToken}&uid=${encodeURIComponent(uid)}`;

    try {
      await sendVerificationEmail({
        to: trimmedEmail,
        verificationLink: restoreLink,
        firstName: first_name.trim(),
      });
    } catch (err) {
      console.error("[signup] Failed to send restore email:", err);
      await adminClient.auth.admin
        .updateUserById(uid, { user_metadata: { restore_token: null } })
        .catch((e) => console.error("CRITICAL: Failed to clear restore token:", e));
      return Response.json(
        {
          error: `The verification email could not be delivered to "${trimmedEmail}". Double-check the address.`,
          code: "EMAIL_DELIVERY_FAILED",
        },
        { status: 422 },
      );
    }

    return Response.json({ success: true }, { status: 201 });
  }

  // --- NEW USER PATH ---
  const domainValid = await domainHasMxRecords(trimmedEmail);
  if (!domainValid) {
    return Response.json(
      {
        error: `The domain for "${trimmedEmail}" does not appear to accept mail. Double-check the address.`,
      },
      { status: 422 },
    );
  }

  let newAuthUserUuid: string | null = null;

  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "signup",
      email: trimmedEmail,
      password,
      options: {
        data: {
          first_name: first_name.trim(),
          middle_name: middle_name?.trim() || "",
          last_name: last_name.trim(),
          role_ids,
        },
        redirectTo: `${origin}/signup/confirmed`,
      },
    });

  if (linkError || !linkData?.user || !linkData?.properties?.action_link) {
    console.error("[signup] generateLink error:", linkError?.message);
    return Response.json(
      {
        error:
          linkError?.message ||
          "Failed to generate verification link. Please try again.",
      },
      { status: 500 },
    );
  }

  newAuthUserUuid = linkData.user.id;

  try {
    await sendVerificationEmail({
      to: trimmedEmail,
      verificationLink: linkData.properties.action_link,
      firstName: first_name.trim(),
    });
  } catch (err) {
    console.error("[signup] Failed to send verification email:", err);
    await adminClient.auth.admin.deleteUser(newAuthUserUuid).catch((e) =>
      console.error("CRITICAL: Auth rollback failed!", e),
    );
    return Response.json(
      {
        error: `The verification email could not be delivered to "${trimmedEmail}". Double-check the address.`,
        code: "EMAIL_DELIVERY_FAILED",
      },
      { status: 422 },
    );
  }

  return Response.json({ success: true }, { status: 201 });
}

export const POST = withErrorHandler(_POST)
