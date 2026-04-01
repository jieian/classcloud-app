import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, UpdateStudentSchema } from "@/lib/api-schemas";
const _PATCH = async function(
  request: Request,
  { params }: { params: Promise<{ lrn: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
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

  const { error } = await admin.rpc("update_student_info", {
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

  return Response.json({ success: true });
}

export const PATCH = withErrorHandler(_PATCH)
