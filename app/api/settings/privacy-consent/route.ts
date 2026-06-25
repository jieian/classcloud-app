import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import { after } from "next/server";
import { auditFromRpc } from "@/lib/audit";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

// ─── POST /api/settings/privacy-consent ──────────────────────────────────────
// Records that the signed-in user re-acknowledged the current Privacy Notice
// (RA 10173). The version is injected server-side from lib/privacy.ts — never
// taken from the request body — so a client cannot stamp an arbitrary/future
// version to suppress later re-consent prompts. The write goes through the
// SECURITY DEFINER RPC (the users table has no client UPDATE policy).
const _POST = async function () {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // User-scoped client so auth.uid() resolves inside the RPC.
  const { data, error } = await supabase.rpc("acknowledge_privacy_notice", {
    p_version: PRIVACY_NOTICE_VERSION,
  });

  if (error) {
    if (isRpcError(error, RpcError.USER_NOT_FOUND))
      return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  after(() =>
    auditFromRpc(
      { actor_id: user.id, action: "privacy_notice_reconsented", entity_type: "user", entity_id: user.id },
      (data as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  return Response.json({ success: true, version: PRIVACY_NOTICE_VERSION });
};

export const POST = withErrorHandler(_POST);
