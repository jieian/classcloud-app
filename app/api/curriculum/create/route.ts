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
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });


  const { error } = await admin
    .from("curriculums")
    .insert({ name, description: body.description ?? null });

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  return Response.json({ success: true }, { status: 201 });
}

export const POST = withErrorHandler(_POST)
