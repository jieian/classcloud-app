import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

const ALLOWED_DOMAINS = ["baliuagu.edu.ph", "gmail.com", "deped.gov.ph"];

type EmailCheckStatus = "available" | "active" | "deleted" | "pending_verification";

// 20 checks per IP per minute — enough for a fast typist, blocks bulk enumeration.
const checkEmailLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

const _GET = async function(request: Request) {
  const ip = getClientIp(request);
  const limit = checkEmailLimiter.check(ip);
  if (!limit.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase();

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
