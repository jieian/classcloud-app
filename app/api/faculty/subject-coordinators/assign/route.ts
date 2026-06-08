import { after } from "next/server";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { parseBody, AssignSubjectCoordinatorSchema } from "@/lib/api-schemas";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import { insertAuditLog } from "@/lib/audit";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

const _POST = async function (request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(AssignSubjectCoordinatorSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { subject_group_id, user_id } = parsed.data;

  const { data: rpcResult, error } = await adminClient.rpc("assign_subject_coordinator", {
    p_subject_group_id: subject_group_id,
    p_user_id: user_id,
  });

  if (error) {
    console.error("assign_subject_coordinator error:", error.message);

    if (isRpcError(error, RpcError.USER_ALREADY_COORDINATOR)) {
      return Response.json(
        { error: "This faculty member is already a coordinator for another subject group." },
        { status: 409 },
      );
    }
    if (isRpcError(error, RpcError.USER_NOT_FACULTY)) {
      return Response.json(
        { error: "Selected user is not a faculty member." },
        { status: 400 },
      );
    }
    if (isRpcError(error, RpcError.USER_NOT_FOUND)) {
      return Response.json(
        { error: "Faculty member not found or inactive." },
        { status: 404 },
      );
    }
    if (isRpcError(error, RpcError.SUBJECT_GROUP_NOT_FOUND)) {
      return Response.json(
        { error: "Subject group not found." },
        { status: 404 },
      );
    }
    if (isRpcError(error, RpcError.NO_ACTIVE_SCHOOL_YEAR)) {
      return Response.json(
        { error: "No active school year found." },
        { status: 409 },
      );
    }

    return Response.json({ error: "Failed to assign coordinator." }, { status: 500 });
  }

  const oldCoordinatorId = (rpcResult as { old_coordinator_id: string | null } | null)
    ?.old_coordinator_id ?? null;

  await redis.del("coordinator:groups", "faculty:candidates", "users:active");
  await invalidateUserAssignmentsContext(user_id);
  if (oldCoordinatorId) await invalidateUserAssignmentsContext(oldCoordinatorId);

  syncUserPermissions(user_id).catch((err) =>
    console.error("syncUserPermissions failed for new coordinator:", err),
  );
  if (oldCoordinatorId) {
    syncUserPermissions(oldCoordinatorId).catch((err) =>
      console.error("syncUserPermissions failed for displaced coordinator:", err),
    );
  }

  after(async () => {
    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: "subject_coordinator_assigned",
      entity_type: "faculty",
      entity_id: user_id,
      new_values: { subject_group_id },
    });

    if (oldCoordinatorId) {
      await insertAuditLog({
        actor_id: caller.id,
        category: "ACADEMIC",
        action: "subject_coordinator_removed",
        entity_type: "faculty",
        entity_id: oldCoordinatorId,
        new_values: { subject_group_id, reason: "replaced" },
      });
    }
  });

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
