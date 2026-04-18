import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { curriculum_id, name, description, subjects, subject_groups } = body;

  if (!curriculum_id) return Response.json({ error: "curriculum_id is required." }, { status: 400 });
  if (!name?.trim()) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!subjects?.length) return Response.json({ error: "At least one subject is required." }, { status: 400 });
  if (!subject_groups?.length) return Response.json({ error: "At least one subject group is required." }, { status: 400 });


  const { data, error } = await admin.rpc("update_curriculum_full", {
    p_curriculum_id: Number(curriculum_id),
    p_name: name.trim(),
    p_description: description?.trim() || null,
    p_subjects: subjects,
    p_subject_groups: subject_groups,
  });

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (data?.success === false) {
    if (data?.code === "DUPLICATE_SUBJECT_CODE")
      return Response.json({ error: data.message }, { status: 409 });
    return Response.json({ error: data.message ?? "Failed to update curriculum." }, { status: 409 });
  }

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  return Response.json({ success: true }, { status: 200 });
}

export const POST = withErrorHandler(_POST)
