import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import type { SectionCard } from "@/lib/services/classService";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

interface SectionUserRow {
  first_name: string | null;
  last_name: string | null;
  deleted_at: string | null;
}

interface SectionRow {
  section_id: number;
  name: string;
  section_type: "SSES" | "REGULAR";
  grade_level_id: number;
  adviser_id: string | null;
  users: SectionUserRow | SectionUserRow[] | null;
}

const _GET = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const syId = Number(new URL(request.url).searchParams.get("syId"));
  if (!syId) {
    return Response.json(
      { error: "Missing syId parameter." },
      { status: 400 },
    );
  }

  const [
    { data: secData, error: secErr },
    { data: enrollData, error: enrollErr },
    { data: assignData },
  ] = await Promise.all([
    admin
      .from("sections")
      .select(
        "section_id, name, section_type, grade_level_id, adviser_id, users(first_name, last_name, deleted_at)",
      )
      .eq("sy_id", syId)
      .is("deleted_at", null),
    admin
      .from("enrollments")
      .select("section_id")
      .eq("sy_id", syId)
      .is("deleted_at", null),
    admin
      .from("teacher_class_assignments")
      .select("section_id, sections!inner(sy_id)")
      .eq("teacher_id", user.id)
      .eq("sections.sy_id", syId)
      .is("deleted_at", null),
  ]);

  if (secErr) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if (enrollErr) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const countMap: Record<number, number> = {};
  for (const enrollment of (enrollData ?? []) as { section_id: number }[]) {
    countMap[enrollment.section_id] =
      (countMap[enrollment.section_id] ?? 0) + 1;
  }

  const sections: SectionCard[] = ((secData ?? []) as SectionRow[]).map((section) => {
    const adviserUser = Array.isArray(section.users)
      ? section.users[0]
      : section.users;
    const adviserName =
      adviserUser &&
      section.adviser_id &&
      adviserUser.deleted_at === null
        ? `${adviserUser.first_name ?? ""} ${adviserUser.last_name ?? ""}`.trim() ||
          null
        : null;

    return {
      section_id: section.section_id,
      name: section.name,
      section_type: section.section_type as "SSES" | "REGULAR",
      adviser_id: section.adviser_id,
      adviser_name: adviserName,
      student_count: countMap[section.section_id] ?? 0,
      grade_level_id: section.grade_level_id,
    };
  });

  const assignedSectionIds = (
    (assignData ?? []) as { section_id: number }[]
  ).map((assignment) => assignment.section_id);

  return Response.json({ sections, assignedSectionIds });
};

export const GET = withErrorHandler(_GET);
