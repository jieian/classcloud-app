import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import type {
  GradeLevelRow,
  SchoolYearOption,
  SectionCard,
} from "@/lib/services/classService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
function resolveDefaultSyId(years: SchoolYearOption[]): number | null {
  return years.find((y) => y.is_active)?.sy_id ?? years[0]?.sy_id ?? null;
}

const _GET = async function() {
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


  const isPartialAccess = !permissions.includes("classes.full_access");

  // Wave 1: school years + grade levels in parallel
  const [
    { data: syData, error: syErr },
    { data: glData, error: glErr },
  ] = await Promise.all([
    admin
      .from("school_years")
      .select("sy_id, year_range, is_active")
      .is("deleted_at", null)
      .order("start_year", { ascending: false }),
    admin
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number"),
  ]);

  if (syErr) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (glErr) return Response.json({ error: "Internal server error." }, { status: 500 });

  const schoolYears = (syData ?? []) as SchoolYearOption[];
  const gradeLevels = (glData ?? []) as GradeLevelRow[];
  const defaultSyId = resolveDefaultSyId(schoolYears);

  if (!defaultSyId) {
    return Response.json({
      schoolYears,
      gradeLevels,
      sections: [] as SectionCard[],
      defaultSyId: null,
      assignedSectionIds: [] as number[],
    });
  }

  // Wave 2: sections + enrollments + optional teacher assignments — all parallel
  const [
    { data: secData, error: secErr },
    { data: enrollData, error: enrollErr },
    { data: assignData },
  ] = await Promise.all([
    admin
      .from("sections")
      .select(
        "section_id, name, section_type, grade_level_id, adviser_id, users(first_name, last_name)",
      )
      .eq("sy_id", defaultSyId)
      .is("deleted_at", null),
    admin.from("enrollments").select("section_id").eq("sy_id", defaultSyId).is("deleted_at", null),
    isPartialAccess
      ? admin
          .from("teacher_class_assignments")
          .select("section_id, sections!inner(sy_id)")
          .eq("teacher_id", user.id)
          .eq("sections.sy_id", defaultSyId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { section_id: number }[], error: null }),
  ]);

  if (secErr) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (enrollErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  // Verify adviser IDs against deleted_at — embedded joins cannot filter joined tables,
  // so a soft-deleted adviser's name would still appear without this post-processing check.
  const adviserIds = ((secData ?? []) as any[])
    .map((s: any) => s.adviser_id)
    .filter(Boolean) as string[];

  let activeAdviserSet = new Set<string>();
  if (adviserIds.length > 0) {
    const { data: activeAdvisers } = await admin
      .from("users")
      .select("uid")
      .in("uid", adviserIds)
      .is("deleted_at", null);
    activeAdviserSet = new Set(
      ((activeAdvisers ?? []) as { uid: string }[]).map((u) => u.uid),
    );
  }

  const countMap: Record<number, number> = {};
  for (const e of (enrollData ?? []) as { section_id: number }[]) {
    countMap[e.section_id] = (countMap[e.section_id] ?? 0) + 1;
  }

  const sections: SectionCard[] = ((secData ?? []) as any[]).map((s) => {
    const u = Array.isArray(s.users) ? s.users[0] : s.users;
    const adviserName =
      u && s.adviser_id && activeAdviserSet.has(s.adviser_id)
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

  return Response.json({
    schoolYears,
    gradeLevels,
    sections,
    defaultSyId,
    assignedSectionIds,
  });
}

export const GET = withErrorHandler(_GET)
