import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { parseBody, AssignGradeSubjectLeaderSchema } from "@/lib/api-schemas";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import { insertAuditLog } from "@/lib/audit";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { invalidateReportsCache } from "@/lib/services/reportsAnalysisService";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";
import { REPORTS_CACHE_TAG } from "@/app/(app)/reports/_lib/reportServerService";
import { redis } from "@/lib/redis";

const _POST = async function (request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(AssignGradeSubjectLeaderSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { curriculum_subject_id, grade_level_id, user_id } = parsed.data;

  const { data: rpcResult, error } = await adminClient.rpc("assign_grade_subject_leader", {
    p_curriculum_subject_id: curriculum_subject_id,
    p_grade_level_id: grade_level_id,
    p_user_id: user_id,
  });

  if (error) {
    console.error("assign_grade_subject_leader error:", error.message);

    if (isRpcError(error, RpcError.USER_NOT_FACULTY)) {
      return Response.json(
        { error: "Selected user is not a faculty member." },
        { status: 400 },
      );
    }
    if (isRpcError(error, RpcError.USER_ALREADY_GRADE_SUBJECT_LEADER)) {
      return Response.json(
        { error: "This faculty member is already a Grade Subject Leader for another subject." },
        { status: 409 },
      );
    }
    if (isRpcError(error, RpcError.USER_NOT_FOUND)) {
      return Response.json(
        { error: "Faculty member not found or inactive." },
        { status: 404 },
      );
    }
    if (isRpcError(error, RpcError.CURRICULUM_SUBJECT_NOT_FOUND)) {
      return Response.json(
        { error: "Curriculum subject not found." },
        { status: 404 },
      );
    }
    if (isRpcError(error, RpcError.NO_ACTIVE_SCHOOL_YEAR)) {
      return Response.json(
        { error: "No active school year found." },
        { status: 409 },
      );
    }

    return Response.json({ error: "Failed to assign grade subject leader." }, { status: 500 });
  }

  const oldLeaderId = (rpcResult as { old_leader_id: string | null } | null)
    ?.old_leader_id ?? null;

  syncUserPermissions(user_id).catch((err) =>
    console.error("syncUserPermissions failed for new grade subject leader:", err),
  );
  if (oldLeaderId) {
    syncUserPermissions(oldLeaderId).catch((err) =>
      console.error("syncUserPermissions failed for displaced grade subject leader:", err),
    );
  }
  invalidateReportsCache();
  revalidateTag(REPORTS_CACHE_TAG, "minutes");
  await redis.del("faculty:gsl", "users:active");
  await invalidateUserAssignmentsContext(user_id);
  if (oldLeaderId) await invalidateUserAssignmentsContext(oldLeaderId);

  after(async () => {
    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: "grade_subject_leader_assigned",
      entity_type: "faculty",
      entity_id: user_id,
      new_values: { curriculum_subject_id, grade_level_id },
    });

    if (oldLeaderId) {
      await insertAuditLog({
        actor_id: caller.id,
        category: "ACADEMIC",
        action: "grade_subject_leader_removed",
        entity_type: "faculty",
        entity_id: oldLeaderId,
        new_values: { curriculum_subject_id, grade_level_id, reason: "replaced" },
      });
    }
  });

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
