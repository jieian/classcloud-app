import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const excludeId = body.exclude_id ? Number(body.exclude_id) : null;
  if (!name) return Response.json({ available: false });

  let query = supabase
    .from("curriculums")
    .select("curriculum_id")
    .ilike("name", name)
    .is("deleted_at", null);

  if (excludeId) query = query.neq("curriculum_id", excludeId);

  const { data, error } = await query.maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ available: data === null });
}
