import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, DeleteStudentSchema } from "@/lib/api-schemas";
import { after } from "next/server";
import { auditFromRpc } from "@/lib/audit";
const _DELETE = async function(request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasFullAccess = permissions.includes("students.full_access");
  const hasPartialAccess = permissions.includes(
    "students.limited_access",
  );
  if (!hasFullAccess && !hasPartialAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(DeleteStudentSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { section_id: sectionId, lrn } = parsed.data;


  // Partial-access users can only delete from sections they advise.
  if (!hasFullAccess) {
    const { data: section, error: secErr } = await admin
      .from("sections")
      .select("adviser_id")
      .eq("section_id", sectionId)
      .is("deleted_at", null)
      .maybeSingle();

    if (secErr) {
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
    if (!section || section.adviser_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: student, error: studentErr } = await admin
    .from("students")
    .select("lrn")
    .eq("lrn", lrn)
    .is("deleted_at", null)
    .maybeSingle();

  if (studentErr) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if (!student) {
    return Response.json({ error: "Student not found." }, { status: 404 });
  }

  const { data, error } = await admin.rpc("soft_delete_student", {
    p_lrn: lrn,
  });

  if (error) {
    return Response.json(
      { error: "Failed to delete student." },
      { status: 500 },
    );
  }

  after(() =>
    auditFromRpc(
      { actor_id: user.id, action: "student_deleted", entity_type: "student", entity_id: lrn },
      (data as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  return Response.json({ success: true });
}

export const DELETE = withErrorHandler(_DELETE)
