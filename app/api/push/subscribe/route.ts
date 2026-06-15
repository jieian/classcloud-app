import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, PushSubscribeSchema } from "@/lib/api-schemas";
import { createRateLimiter } from "@/lib/rate-limit";

// ─── POST /api/push/subscribe ─────────────────────────────────────────────────
// Body: { endpoint, p256dh, auth } — registers/refreshes this device's Web Push
// subscription for the authenticated user. Upsert by endpoint so re-subscribing
// (or a different user on the same device) cleanly takes over the row.

// Per-user limiter (module-level singleton): subscribe is a low-frequency action.
const limiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  prefix: "push_sub",
});

const _POST = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await limiter.check(user.id);
  if (!allowed)
    return Response.json({ error: "Too many requests." }, { status: 429 });

  const parsed = parseBody(PushSubscribeSchema, await request.json().catch(() => ({})));
  if (!parsed.success) return parsed.response;
  const { endpoint, p256dh, auth } = parsed.data;

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent"),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
