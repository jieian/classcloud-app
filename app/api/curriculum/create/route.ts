import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getUserPermissions } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin
    .from("curriculums")
    .insert({ name, description: body.description ?? null });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  return Response.json({ success: true }, { status: 201 });
}
