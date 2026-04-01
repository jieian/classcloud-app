import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 10 checks per IP per minute — matches realistic login-page usage.
const checkPendingLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

const _POST = async function(request: Request) {
  const ip = getClientIp(request);
  const limit = checkPendingLimiter.check(ip);
  if (!limit.allowed) {
    return Response.json({ pending: false }, { status: 429 });
  }

  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return Response.json({ pending: false });
  }

  // Use service role to bypass RLS and access auth.users

  // Find the auth user by email
  const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const authUser = authData?.users?.find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
  );

  if (!authUser) {
    return Response.json({ pending: false });
  }

  // Check if their profile is pending
  const { data } = await adminClient
    .from("users")
    .select("active_status")
    .eq("uid", authUser.id)
    .eq("active_status", 0)
    .maybeSingle();

  return Response.json({ pending: !!data });
}

export const POST = withErrorHandler(_POST)
