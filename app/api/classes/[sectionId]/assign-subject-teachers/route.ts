import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, AssignSubjectTeachersSchema } from "@/lib/api-schemas";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { auditFromRpc } from "@/lib/audit";
import { dispatchSubjectTeachersChanged } from "@/lib/notifications";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";
import { invalidateReportsCache } from "@/lib/services/reportsAnalysisService";
import { REPORTS_CACHE_TAG } from "@/app/(app)/reports/_lib/reportServerService";
const _POST = async function(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const parsed = parseBody(AssignSubjectTeachersSchema, await request.json());
  if (!parsed.success) return parsed.response;


  // Single atomic RPC — soft-delete + re-insert in one transaction
  const { data: assignData, error } = await admin.rpc("set_section_subject_teachers", {
    p_section_id: sectionId,
    p_assignments: parsed.data.assignments,
  });

  if (error)
    return Response.json(
      { error: "Failed to update subject teacher assignments." },
      { status: 500 },
    );

  const affectedTeacherIds =
    (assignData as { affected_teacher_ids?: string[] } | null)?.affected_teacher_ids ?? [];

  revalidateTag("sections", "minutes");
  // Teacher assignments feed the report section/subject cards (teacher names),
  // and each affected teacher's dashboard reads their cached teaching load.
  revalidateTag(REPORTS_CACHE_TAG, "minutes");
  invalidateReportsCache();
  await Promise.allSettled(
    affectedTeacherIds.map((uid) => invalidateUserAssignmentsContext(uid)),
  );

  after(() =>
    auditFromRpc(
      { actor_id: user.id, action: "subject_teachers_assigned", entity_type: "section", entity_id: String(sectionId) },
      (assignData as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  // Notify the section's currently-assigned subject teachers (actor excluded).
  after(() =>
    dispatchSubjectTeachersChanged({
      sectionLabel:
        (assignData as { _audit?: { label?: string | null } } | null)?._audit?.label ?? null,
      teacherUids: parsed.data.assignments.map((a) => a.teacher_id),
      actorUid: user.id,
    }),
  );

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
