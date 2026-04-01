import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getUserPermissions } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, description, subjects, subject_groups } = body;

  if (!name?.trim()) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!subjects?.length) return Response.json({ error: "At least one subject is required." }, { status: 400 });
  if (!subject_groups?.length) return Response.json({ error: "At least one subject group is required." }, { status: 400 });


  const { data: rpcResult, error: rpcError } = await admin.rpc("create_curriculum_full", {
    p_name: name.trim(),
    p_description: description?.trim() || null,
    p_subjects: subjects,
    p_subject_groups: subject_groups,
  });

  if (rpcError) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (rpcResult?.success === false)
    return Response.json({ error: "Failed to create curriculum." }, { status: 500 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  return Response.json({ success: true, curriculum_id: rpcResult?.curriculum_id }, { status: 201 });
}

export const POST = withErrorHandler(_POST)
