import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import type { SectionCard } from "@/app/(app)/school/classes/_lib/classService";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("access_classes_management") ||
    permissions.includes("partial_access_student_management") ||
    permissions.includes("full_access_student_management");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const syId = Number(new URL(request.url).searchParams.get("syId"));
  if (!syId)
    return Response.json({ error: "Missing syId parameter." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const isPartialAccess =
    permissions.includes("partial_access_student_management") &&
    !permissions.includes("access_classes_management") &&
    !permissions.includes("full_access_student_management");

  // sections + enrollments + optional teacher assignments — all parallel
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
      .eq("sy_id", syId)
      .is("deleted_at", null),
    admin.from("enrollments").select("section_id").eq("sy_id", syId).is("deleted_at", null),
    isPartialAccess
      ? admin
          .from("teacher_class_assignments")
          .select("section_id")
          .eq("teacher_id", user.id)
          .eq("sy_id", syId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { section_id: number }[], error: null }),
  ]);

  if (secErr) return Response.json({ error: secErr.message }, { status: 500 });
  if (enrollErr)
    return Response.json({ error: enrollErr.message }, { status: 500 });

  // Verify adviser IDs against deleted_at — embedded joins cannot filter joined tables.
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

  return Response.json({ sections, assignedSectionIds });
}
