import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];

type EmailCheckStatus = "available" | "active" | "deleted" | "pending_verification";

// 20 checks per IP per minute — enough for a fast typist, blocks bulk enumeration.
const checkEmailLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

const _GET = async function(request: Request) {
  const ip = getClientIp(request);
  const { searchParams } = new URL(request.url);
  const emailParam = searchParams.get("email")?.trim().toLowerCase() ?? null;

  const limit = await checkEmailLimiter.check(ip);
  if (!limit.allowed) {
    void insertAuditLog({
      actor_id: null,
      category: "SECURITY",
      action: "rate_limit_exceeded",
      entity_type: "ip_address",
      entity_id: ip,
      entity_label: "GET /api/auth/check-email",
      metadata: { endpoint: "/api/auth/check-email", email: emailParam },
    });
    return Response.json({ error: "Too many email checks. Please wait a moment before trying again." }, { status: 429 });
  }

  const email = emailParam;

  if (!email || !ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d}`))) {
    return Response.json({ error: "Invalid email." }, { status: 400 });
  }


  const { data, error } = await adminClient.rpc("check_email_status", {
    p_email: email,
    p_exclude_uid: null,
  });

  if (error) {
    return Response.json({ error: "Failed to check email." }, { status: 500 });
  }

  // Pass through all statuses including the new 'pending_verification' status
  // returned by the updated check_email_status RPC.
  const status = (data as { status: EmailCheckStatus }).status;
  return Response.json({ status });
}

export const GET = withErrorHandler(_GET)
