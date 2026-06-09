import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import { syncUsersBatch } from "@/lib/permissions-sync";
import { parseBody, SaveMasterlistSchema } from "@/lib/api-schemas";
import { auditFromRpc } from "@/lib/audit";
import { after } from "next/server";
import { redis } from "@/lib/redis";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

// Shape returned by save_teaching_load_masterlist (jsonb).
type MasterlistResult = {
  permission_changed_uids?: string[];
  context_changed_uids?: string[];
  _audit?: {
    label: string | null;
    old?: Record<string, unknown> | null;
    new?: Record<string, unknown> | null;
    changes?: Array<Record<string, unknown>> | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

const _POST = async function (request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(SaveMasterlistSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { sy_id: clientSyId, adviser_changes, assignment_changes } = parsed.data;

  // ── Stale-data / SY-change guard ─────────────────────────────────────────
  // Verify the school year the client loaded is still the active one.
  // Catches: SY changed while editing, SY deactivated while editing.
  const ctx = await getActiveContext();

  if (!ctx.sy_id) {
    return Response.json(
      { error: "No active school year. Please refresh and try again.", code: "NO_ACTIVE_SY" },
      { status: 409 },
    );
  }

  if (ctx.sy_id !== clientSyId) {
    return Response.json(
      {
        error: "The school year changed while you were editing. Please refresh and try again.",
        code: "SY_CHANGED",
      },
      { status: 409 },
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (adviser_changes.length === 0 && assignment_changes.length === 0) {
    return Response.json({ success: true }, { status: 200 });
  }

  // The RPC computes everything in-transaction: it applies the changes and
  // returns the audit diff, the minimal permission-sync uid set, and the broad
  // context-invalidation uid set — so no pre-read queries are needed here.
  const { data, error } = await adminClient.rpc("save_teaching_load_masterlist", {
    p_advisers: adviser_changes,
    p_assignments: assignment_changes,
  });

  if (error) {
    console.error("save_teaching_load_masterlist error:", error.message);

    // Surface RPC-level guard errors as 409 so the client can show a meaningful message
    if (error.message.includes("NO_ACTIVE_SCHOOL_YEAR")) {
      return Response.json(
        { error: "No active school year. Please refresh and try again.", code: "NO_ACTIVE_SY" },
        { status: 409 },
      );
    }
    if (error.message.includes("STALE_DATA")) {
      return Response.json(
        {
          error: "The school year changed while you were editing. Please refresh and try again.",
          code: "SY_CHANGED",
        },
        { status: 409 },
      );
    }

    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const result = data as MasterlistResult | null;

  await redis.del("faculty:list", "faculty:candidates", "users:active");

  const permUids: string[] = result?.permission_changed_uids ?? [];
  const ctxUids: string[] = result?.context_changed_uids ?? [];

  after(async () => {
    // 1) One summary audit row — human-readable, zero extra reads
    await auditFromRpc(
      {
        actor_id: caller.id,
        action: "masterlist_saved",
        entity_type: "school_year",
        entity_id: String(ctx.sy_id),
      },
      result?._audit,
    );
    // 2) Permission sync — ONLY uids whose Faculty role flipped, capped concurrency
    await syncUsersBatch(permUids);
    // 3) Assignment-context cache — broader touched set
    await Promise.allSettled(ctxUids.map((uid) => invalidateUserAssignmentsContext(uid)));
  });

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
