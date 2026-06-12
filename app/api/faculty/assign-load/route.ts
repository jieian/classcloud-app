import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { parseBody, AssignAcademicLoadSchema } from "@/lib/api-schemas";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import { auditFromRpc } from "@/lib/audit";
import { dispatchFacultyLoadChanged } from "@/lib/notifications";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

const _POST = async function (request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(AssignAcademicLoadSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const {
    faculty_id,
    advisory_section_id,
    subject_assignments,
    subject_group_id,
    gsl_curriculum_subject_id,
    gsl_grade_level_id,
  } = parsed.data;

  // subject_group_id presence (even if null) means add mode — manage coordinator
  const manageCoordinator = subject_group_id !== undefined;
  // gsl_curriculum_subject_id presence (even if null) means add mode — manage GSL
  const manageGSL = gsl_curriculum_subject_id !== undefined;

  const { data: rpcData, error } = await adminClient.rpc("assign_faculty_academic_load", {
    p_faculty_id: faculty_id,
    p_advisory_section_id: advisory_section_id ?? null,
    p_subject_assignments: subject_assignments,
    p_manage_coordinator: manageCoordinator,
    p_subject_group_id: subject_group_id ?? null,
    p_manage_gsl: manageGSL,
    p_gsl_curriculum_subject_id: gsl_curriculum_subject_id ?? null,
    p_gsl_grade_level_id: gsl_grade_level_id ?? null,
  });

  if (error) {
    console.error("assign_faculty_academic_load error:", error.message);
    if (isRpcError(error, RpcError.COORDINATOR_GROUP_TAKEN)) {
      return Response.json(
        { error: "This subject group already has a coordinator." },
        { status: 409 },
      );
    }
    if (isRpcError(error, RpcError.GSL_SLOT_TAKEN)) {
      return Response.json(
        { error: "This grade subject leader slot is already filled. Please choose a different subject or grade level." },
        { status: 409 },
      );
    }
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  await redis.del("faculty:list", "faculty:candidates", "coordinator:groups", "users:active");
  revalidateTag("sections", "minutes");
  revalidateTag("reports", "minutes");
  await invalidateUserAssignmentsContext(faculty_id);

  // Non-blocking audit write, off the response path. The envelope carries the
  // faculty name (label) and the REAL change deltas computed inside the RPC
  // transaction — no longer fabricated from payload presence. An empty
  // changes[] (re-submit with no real change) writes new_values { changes: [] }.
  after(() =>
    auditFromRpc(
      {
        actor_id: caller.id,
        action: "faculty_academic_load_assigned",
        entity_type: "faculty",
        entity_id: faculty_id,
      },
      (rpcData as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  // Change-type-driven pointer notifications (Part 2a): fires only the change
  // types actually present in the real delta; empty changes → nothing fires.
  after(() =>
    dispatchFacultyLoadChanged({
      facultyId: faculty_id,
      changes:
        (rpcData as { _audit?: { changes?: Record<string, unknown>[] } } | null)
          ?._audit?.changes ?? null,
      actorUid: caller.id,
    }),
  );

  syncUserPermissions(faculty_id).catch((err) =>
    console.error("syncUserPermissions failed after assign-load:", err),
  );

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
