import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, decryptPassword } from "@/lib/crypto";

/** Masks an email for display: j***@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  const visible = local.length > 1 ? local[0] : local;
  return `${visible}***@${domain}`;
}

const _POST = async function (request: Request) {
  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await request.json();
  const rawToken = body?.token;

  if (!rawToken || typeof rawToken !== "string") {
    return Response.json({ status: "invalid" }, { status: 400 });
  }

  // ── Hash + look up pending row ────────────────────────────────────────────
  const incomingHash = hashToken(rawToken);

  const { data: row, error: fetchError } = await adminClient
    .from("pending_registrations")
    .select("*")
    .eq("token_hash", incomingHash)
    .maybeSingle();

  if (fetchError) {
    console.error("[confirm] DB fetch error:", fetchError.message);
    return Response.json({ status: "error" }, { status: 500 });
  }

  // ── Row not found: either already confirmed or genuinely invalid ──────────
  if (!row) {
    return Response.json({ status: "not_found" });
  }

  // ── Expired ───────────────────────────────────────────────────────────────
  if (new Date(row.expires_at) <= new Date()) {
    return Response.json({ status: "expired", maskedEmail: maskEmail(row.email), email: row.email });
  }

  // ── Idempotency: detect already-verified retries ──────────────────────────
  // The auth user exists but the RPC may have been called before (row still
  // present due to partial failure). Re-attempt the RPC so roles/profile are set.
  const { data: authLookup } = await adminClient.auth.admin.listUsers();
  const existingAuthUser = authLookup?.users?.find(
    (u) => u.email?.toLowerCase() === row.email.toLowerCase(),
  );

  if (existingAuthUser) {
    // Check if public profile already exists
    const { data: existingProfile } = await adminClient
      .from("users")
      .select("uid")
      .eq("uid", existingAuthUser.id)
      .maybeSingle();

    if (existingProfile) {
      // Fully confirmed already — clean up pending row and return success
      await adminClient
        .from("pending_registrations")
        .delete()
        .eq("token_hash", incomingHash)
        .then(null, (e) => console.error("[confirm] Failed to clean up already-verified pending row:", e));

      return Response.json({ status: "already_verified" });
    }

    // Auth user exists but profile missing (partial failure on prior attempt).
    // Fall through to re-run the RPC with the existing uid.
  }

  // ── Decrypt password ──────────────────────────────────────────────────────
  let decryptedPassword: string;
  try {
    decryptedPassword = decryptPassword(row.encrypted_password);
  } catch (err) {
    console.error("[confirm] CRITICAL: Password decryption failed. Key mismatch or corrupted row.", err);
    return Response.json({ status: "error" }, { status: 500 });
  }

  // ── Auth API call (outside DB transaction — unavoidable) ──────────────────
  let uid: string;

  if (row.type === "new") {
    if (existingAuthUser) {
      // Auth user was created on a prior attempt — reuse uid
      uid = existingAuthUser.id;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: row.email,
        password: decryptedPassword,
        email_confirm: true,
      });

      if (createError || !created?.user) {
        console.error("[confirm] createUser error:", createError?.message);
        return Response.json({ status: "error" }, { status: 500 });
      }

      uid = created.user.id;
    }
  } else {
    // type === 'restore'
    uid = row.restore_uid as string;

    const { error: updateError } = await adminClient.auth.admin.updateUserById(uid, {
      password: decryptedPassword,
      // Note: ban_duration is intentionally NOT lifted here.
      // The auth ban stays until the admin approves the account.
    });

    if (updateError) {
      console.error("[confirm] updateUserById (restore) error:", updateError.message);
      return Response.json({ status: "error" }, { status: 500 });
    }
  }

  // ── Atomic public-schema operations via RPC ───────────────────────────────
  // confirm_pending_registration atomically:
  //   1. Inserts/restores public.users row (active_status = 0, pending)
  //   2. Replaces user_roles
  //   3. Deletes the pending_registrations row
  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
    "confirm_pending_registration",
    {
      p_token_hash:  incomingHash,
      p_uid:         uid,
      p_type:        row.type,
      p_first_name:  row.first_name,
      p_middle_name: row.middle_name ?? "",
      p_last_name:   row.last_name,
      p_role_ids:    row.role_ids ?? [],
    },
  );

  if (rpcError) {
    console.error("[confirm] CRITICAL: confirm_pending_registration RPC failed:", rpcError.message, "uid:", uid, "email:", row.email);
    return Response.json({ status: "error" }, { status: 500 });
  }

  if (rpcResult?.success === false) {
    console.error("[confirm] RPC returned success=false for uid:", uid);
    return Response.json({ status: "error" }, { status: 500 });
  }

  return Response.json({ status: "success" });
};

export const POST = withErrorHandler(_POST);
