import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import { CACHE_TAGS } from "@/lib/cache-tags";

// ─────────────────────────────────────────────────────────────────────────────
// Cached, server-side reference-data fetchers for the exam-create flow.
// Replaces the browser-direct PostgREST reads in sectionService/quarterService/
// subjectService (audit #5). Each is scoped to the active school year /
// curriculum and tagged so the existing mutation routes already invalidate it:
//   • sections  → revalidated by classes/* and schoolYear/create-full ("sections")
//   • quarters  → revalidated by toggle-quarter + schoolYear/* (active-context,
//                 school-years)
//   • subjects  → revalidated by curriculum/* and schoolYear/* ("subjects")
// active-context is added everywhere so activating a new SY refreshes all three.
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveSectionRow = {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  sy_id: number | null;
  adviser_id: string | null;
  section_type: "REGULAR" | "SSES" | null;
  grade_levels?: { display_name: string } | null;
};

export type ActiveQuarterRow = {
  quarter_id: number;
  name: string;
  is_active: boolean;
  sy_id: number;
};

export type ActiveSubjectRow = {
  curriculum_subject_id: number;
  subject_id: number;
  name: string;
  code: string;
  grade_level_id: number;
  subject_type: "BOTH" | "SSES";
};

async function resolveActiveSyId(): Promise<number | null> {
  const { data } = await admin
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { sy_id: number } | null)?.sy_id ?? null;
}

export async function getActiveSectionsCached(): Promise<ActiveSectionRow[]> {
  "use cache";
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.ACTIVE_CONTEXT);
  cacheLife("hours");

  const syId = await resolveActiveSyId();

  let query = admin
    .from("sections")
    .select(
      "section_id, name, grade_level_id, sy_id, adviser_id, section_type, grade_levels(display_name)",
    )
    .order("name", { ascending: true });

  // Preserve prior behaviour: fall back to all sections if no active SY.
  if (syId) query = query.eq("sy_id", syId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ActiveSectionRow[];
}

export async function getActiveQuartersCached(): Promise<ActiveQuarterRow[]> {
  "use cache";
  cacheTag(CACHE_TAGS.SCHOOL_YEARS, CACHE_TAGS.ACTIVE_CONTEXT);
  cacheLife("hours");

  const syId = await resolveActiveSyId();

  let query = admin
    .from("quarters")
    .select("quarter_id, name, is_active, sy_id")
    .order("quarter_id", { ascending: true });

  if (syId) query = query.eq("sy_id", syId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ActiveQuarterRow[];
}

export async function getActiveSubjectsWithGradeLevelsCached(): Promise<
  ActiveSubjectRow[]
> {
  "use cache";
  cacheTag(CACHE_TAGS.SUBJECTS, CACHE_TAGS.ACTIVE_CONTEXT);
  cacheLife("hours");

  const { data: sy } = await admin
    .from("school_years")
    .select("curriculum_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  const curriculumId = (sy as { curriculum_id: number | null } | null)
    ?.curriculum_id;
  if (!curriculumId) return [];

  const { data, error } = await admin
    .from("curriculum_subjects")
    .select(
      "curriculum_subject_id, grade_level_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)",
    )
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown[]).flatMap((raw) => {
    const row = raw as {
      curriculum_subject_id: number;
      grade_level_id: number;
      subjects:
        | {
            subject_id: number;
            name: string;
            code: string;
            subject_type: "BOTH" | "SSES";
            deleted_at: string | null;
          }
        | null;
    };
    const sub = row.subjects;
    if (!sub || sub.deleted_at !== null) return [];
    return [
      {
        curriculum_subject_id: row.curriculum_subject_id,
        subject_id: sub.subject_id,
        name: sub.name,
        code: sub.code,
        grade_level_id: row.grade_level_id,
        subject_type: sub.subject_type,
      },
    ];
  });
}
