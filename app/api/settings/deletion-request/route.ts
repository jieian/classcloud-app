import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";
import { dispatchDeletionRequested, getUsersWithPermission } from "@/lib/notifications";
import { after } from "next/server";

// RA 10173 — data-subject-initiated account deletion request (admin-mediated).
// All access is server-side via the admin client; the table is service-role-only.

// Per-uid throttle — bounds PENDING→WITHDRAWN→PENDING notification-spam cycling.
// Redis-backed → enforced across instances.
const requestLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 86_400_000, // 24 hours
  prefix: "deletion-request",
});

const ACTIVE = ["PENDING", "APPROVING"] as const;

// ─── POST — submit a deletion request ────────────────────────────────────────
const _POST = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Short-circuit a duplicate active request WITHOUT burning a rate-limit token.
  const { data: existing } = await admin
    .from("account_deletion_requests")
    .select("request_id")
    .eq("uid", user.id)
    .in("status", ACTIVE as unknown as string[])
    .maybeSingle();
  if (existing) {
    return Response.json(
      { error: "You already have a pending account deletion request." },
      { status: 409 },
    );
  }

  // 2. Rate limit.
  const rl = await requestLimiter.check(user.id);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  // 3. Sole-admin guard — block the only remaining administrator from locking the
  //    org out (their request could never be acted on). getUsersWithPermission
  //    already filters to active, non-deleted users.
  const admins = await getUsersWithPermission("users.full_access");
  if (admins.length === 1 && admins[0]?.uid === user.id) {
    return Response.json(
      {
        error:
          "You are currently the only administrator. Please assign another administrator before requesting deletion of your account.",
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 1000)
      : null;

  // 4. Insert PENDING with the session email captured for reliable later notify.
  const { data: inserted, error: insertError } = await admin
    .from("account_deletion_requests")
    .insert({
      uid: user.id,
      reason,
      requester_email: user.email ?? null,
    })
    .select("request_id")
    .single();

  if (insertError) {
    // Unique-violation = a concurrent active request slipped in.
    if (insertError.code === "23505") {
      return Response.json(
        { error: "You already have a pending account deletion request." },
        { status: 409 },
      );
    }
    console.error("[deletion-request] insert error:", insertError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const requestId = inserted.request_id as string;

  insertAuditLog({
    actor_id: user.id,
    action: "deletion_requested",
    entity_type: "user",
    entity_id: user.id,
    metadata: reason ? { reason } : undefined,
  }).catch(() => {});

  after(() => dispatchDeletionRequested({ requestId, requesterUid: user.id }));

  return Response.json({ success: true });
};

// ─── DELETE — withdraw a pending request ─────────────────────────────────────
const _DELETE = async function () {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: withdrawn } = await admin
    .from("account_deletion_requests")
    .update({ status: "WITHDRAWN", requester_email: null })
    .eq("uid", user.id)
    .eq("status", "PENDING")
    .select("request_id");

  if (!withdrawn || withdrawn.length === 0) {
    return Response.json(
      { error: "No pending request to withdraw." },
      { status: 409 },
    );
  }

  insertAuditLog({
    actor_id: user.id,
    action: "deletion_request_withdrawn",
    entity_type: "user",
    entity_id: user.id,
  }).catch(() => {});

  return Response.json({ success: true });
};

// ─── GET — the user's latest request (subject-facing columns only) ───────────
const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Explicit subject-facing columns only — NEVER internal_note.
  const { data } = await admin
    .from("account_deletion_requests")
    .select("status, requested_at, decided_at, decision_note")
    .eq("uid", user.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({ request: data ?? null });
};

export const POST = withErrorHandler(_POST);
export const DELETE = withErrorHandler(_DELETE);
export const GET = withErrorHandler(_GET);
