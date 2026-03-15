import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const gradeLevelId = Number(body.grade_level_id);
  const sectionType = body.section_type as string;

  if (!name || !gradeLevelId || !["REGULAR", "SSES"].includes(sectionType))
    return Response.json({ error: "Invalid input." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: syData, error: syError } = await admin
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (syError)
    return Response.json({ error: syError.message }, { status: 500 });
  if (!syData)
    return Response.json(
      { error: "No active school year found." },
      { status: 400 },
    );

  // Check name uniqueness (case-insensitive)
  const { data: nameTaken } = await admin
    .from("sections")
    .select("section_id")
    .eq("grade_level_id", gradeLevelId)
    .eq("sy_id", syData.sy_id)
    .is("deleted_at", null)
    .ilike("name", name)
    .maybeSingle();

  if (nameTaken) {
    return Response.json({
      available: false,
      conflict: "name",
      error:
        "A class with this name already exists in this grade level for the active school year.",
    });
  }

  // Check SSES uniqueness
  if (sectionType === "SSES") {
    const { data: ssesTaken } = await admin
      .from("sections")
      .select("section_id")
      .eq("grade_level_id", gradeLevelId)
      .eq("sy_id", syData.sy_id)
      .eq("section_type", "SSES")
      .is("deleted_at", null)
      .maybeSingle();

    if (ssesTaken) {
      return Response.json({
        available: false,
        conflict: "sses",
        error:
          "An SSES class already exists for this grade level in the active school year.",
      });
    }
  }

  return Response.json({ available: true });
}
