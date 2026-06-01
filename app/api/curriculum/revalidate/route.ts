import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";
import { withErrorHandler } from "@/lib/api-error";

const _POST = async function () {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  revalidateTag("subjects", "minutes");
  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
