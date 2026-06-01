import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { redis } from "@/lib/redis";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { parseBody, AssignAcademicLoadSchema } from "@/lib/api-schemas";
import { isRpcError, RpcError } from "@/lib/rpc-errors";
import { insertAuditLog } from "@/lib/audit";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

const _POST = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

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

  const { error } = await adminClient.rpc("assign_faculty_academic_load", {
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

  await redis.del("faculty:list", "faculty:candidates", "coordinator:groups");
  revalidateTag("sections", "minutes");
  revalidateTag("reports", "minutes");
  await invalidateUserAssignmentsContext(faculty_id);

  // Non-blocking audit writes — don't delay the response
  after(async () => {
    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: "faculty_academic_load_assigned",
      entity_type: "faculty",
      entity_id: faculty_id,
      new_values: {
        advisory_section_id: advisory_section_id ?? null,
        sections_assigned: new Set(subject_assignments.map((a) => a.section_id)).size,
        subjects_assigned: subject_assignments.length,
      },
    });

    // Dedicated advisory class audit entry
    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: advisory_section_id != null ? "advisory_class_assigned" : "advisory_class_removed",
      entity_type: "faculty",
      entity_id: faculty_id,
      new_values: { advisory_section_id: advisory_section_id ?? null },
    });

    if (manageCoordinator) {
      await insertAuditLog({
        actor_id: caller.id,
        category: "ACADEMIC",
        action: subject_group_id != null
          ? "subject_coordinator_assigned"
          : "subject_coordinator_removed",
        entity_type: "faculty",
        entity_id: faculty_id,
        new_values: { subject_group_id: subject_group_id ?? null },
      });
    }

    if (manageGSL) {
      await insertAuditLog({
        actor_id: caller.id,
        category: "ACADEMIC",
        action: gsl_curriculum_subject_id != null
          ? "grade_subject_leader_assigned"
          : "grade_subject_leader_removed",
        entity_type: "faculty",
        entity_id: faculty_id,
        new_values: {
          gsl_curriculum_subject_id: gsl_curriculum_subject_id ?? null,
          gsl_grade_level_id: gsl_grade_level_id ?? null,
        },
      });
    }
  });

  syncUserPermissions(faculty_id).catch((err) =>
    console.error("syncUserPermissions failed after assign-load:", err),
  );

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
