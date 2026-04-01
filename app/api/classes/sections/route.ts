import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import type { SectionCard } from "@/lib/services/classService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
const _GET = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const syId = Number(new URL(request.url).searchParams.get("syId"));
  if (!syId)
    return Response.json({ error: "Missing syId parameter." }, { status: 400 });


  const isPartialAccess = !permissions.includes("classes.full_access");

  // sections + enrollments + optional teacher assignments — all parallel
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
    admin.from("enrollments").select("section_id").eq("sy_id", syId).is("deleted_at", null),
    isPartialAccess
      ? admin
          .from("teacher_class_assignments")
          .select("section_id, sections!inner(sy_id)")
          .eq("teacher_id", user.id)
          .eq("sections.sy_id", syId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { section_id: number }[], error: null }),
  ]);

  if (secErr) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (enrollErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const countMap: Record<number, number> = {};
  for (const e of (enrollData ?? []) as { section_id: number }[]) {
    countMap[e.section_id] = (countMap[e.section_id] ?? 0) + 1;
  }

  const sections: SectionCard[] = ((secData ?? []) as any[]).map((s) => {
    const u = Array.isArray(s.users) ? s.users[0] : s.users;
    // deleted_at is included in the join — no extra round-trip needed.
    const adviserName =
      u && s.adviser_id && u.deleted_at === null
        ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null
        : null;
    return {
      section_id: s.section_id,
      name: s.name,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_id: s.adviser_id,
      adviser_name: adviserName,
      student_count: countMap[s.section_id] ?? 0,
      grade_level_id: s.grade_level_id,
    };
  });

  const assignedSectionIds = (
    (assignData ?? []) as { section_id: number }[]
  ).map((a) => a.section_id);

  return Response.json({ sections, assignedSectionIds });
}

export const GET = withErrorHandler(_GET)
