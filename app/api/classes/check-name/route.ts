import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/classes/check-name?gradeLevelId=&name=&excludeSectionId= ─────────
// Advisory name-collision pre-check for the rename-section modal: is there
// another (non-deleted) section in this grade level with the same name,
// excluding the section being renamed? Replaces the browser-direct PostgREST
// read in classService.checkSectionNameExists. Behaviour preserved exactly,
// including not scoping by school year (rename_section enforces the real
// (name, grade_level_id, sy_id) uniqueness at write time; this is advisory).

const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const gradeLevelId = Number(searchParams.get("gradeLevelId"));
  const name = (searchParams.get("name") ?? "").trim();
  const excludeSectionId = Number(searchParams.get("excludeSectionId"));

  if (!gradeLevelId || !name || !excludeSectionId)
    return Response.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await admin
    .from("sections")
    .select("section_id")
    .eq("grade_level_id", gradeLevelId)
    .ilike("name", name)
    .neq("section_id", excludeSectionId)
    .is("deleted_at", null)
    .limit(1);

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ exists: (data?.length ?? 0) > 0 });
};

export const GET = withErrorHandler(_GET);
