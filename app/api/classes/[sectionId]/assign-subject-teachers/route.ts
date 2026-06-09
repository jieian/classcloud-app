import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, AssignSubjectTeachersSchema } from "@/lib/api-schemas";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
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
  const { error } = await admin.rpc("set_section_subject_teachers", {
    p_section_id: sectionId,
    p_assignments: parsed.data.assignments,
  });

  if (error)
    return Response.json(
      { error: "Failed to update subject teacher assignments." },
      { status: 500 },
    );

  revalidateTag("sections", "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "subject_teachers_assigned",
      entity_type: "section",
      entity_id: String(sectionId),
      // per-subject old/new teacher names deferred — set_section_subject_teachers _audit.
      new_values: { assignment_count: parsed.data.assignments.length },
    }).catch(() => {}),
  );

  return Response.json({ success: true });
}

export const POST = withErrorHandler(_POST)
