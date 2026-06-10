import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, UpdateStudentSchema } from "@/lib/api-schemas";
import { after } from "next/server";
import { auditFromRpc } from "@/lib/audit";
const _PATCH = async function(
  request: Request,
  { params }: { params: Promise<{ lrn: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { lrn: oldLrn } = await params;
  if (!oldLrn)
    return Response.json({ error: "Invalid LRN." }, { status: 400 });

  const parsed = parseBody(UpdateStudentSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { lrn: newLrn, last_name: lastName, first_name: firstName, middle_name: middleName, sex } = parsed.data;


  // If LRN is changing, ensure the new one isn't taken
  if (newLrn !== oldLrn) {
    const { data: existing } = await admin
      .from("students")
      .select("lrn")
      .eq("lrn", newLrn)
      .maybeSingle();

    if (existing)
      return Response.json(
        { error: `LRN ${newLrn} is already in use by another student.` },
        { status: 409 },
      );
  }

  const { data, error } = await admin.rpc("update_student_info", {
    p_old_lrn: oldLrn,
    p_new_lrn: newLrn,
    p_last_name: lastName,
    p_first_name: firstName,
    p_middle_name: middleName,
    p_sex: sex,
  });

  if (error)
    return Response.json(
      { error: "Failed to update student." },
      { status: 500 },
    );

  after(() =>
    auditFromRpc(
      { actor_id: user.id, action: "student_updated", entity_type: "student", entity_id: newLrn },
      (data as { _audit?: Parameters<typeof auditFromRpc>[1] } | null)?._audit,
    ),
  );

  return Response.json({ success: true });
}

export const PATCH = withErrorHandler(_PATCH)
