import { redis } from "@/lib/redis";
import { adminClient } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import type { AssignedScope } from "@/lib/services/reportsAnalysisService";

const CACHE_TTL = 1800;
const KEY_PREFIX = "profile:context";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface UserContextAdvisorySection {
  section_id: number;
  name: string;
  grade_level_id: number;
  grade_display_name: string;
}

export interface UserContextTeachingAssignment {
  section_id: number;
  section_name: string;
  grade_level_id: number;
  grade_display_name: string;
  curriculum_subject_id: number;
  subject_id: number;
  subject_name: string;
}

export interface UserContextGsl {
  curriculum_subject_id: number;
  grade_level_id: number;
  subject_id: number;
  subject_name: string;
  grade_display_name: string;
}

export interface UserContextCoordinator {
  subject_group_id: number;
  subject_group_name: string;
  curriculum_subject_ids: number[];
}

export interface UserContext {
  activeSyId: number | null;
  advisorySections: UserContextAdvisorySection[];
  teachingAssignments: UserContextTeachingAssignment[];
  gsl: UserContextGsl | null;
  coordinator: UserContextCoordinator | null;
}

// ─── Internal DB row types ────────────────────────────────────────────────────

type GlRow = { grade_level_id: number; display_name: string };
type SubjectRow = { subject_id: number; name: string };
type AdvisoryDbRow = { section_id: number; name: string; grade_level_id: number };

type TeachingDbRow = {
  section_id: number;
  curriculum_subject_id: number;
  sections: { name: string; grade_level_id: number } | { name: string; grade_level_id: number }[] | null;
  curriculum_subjects: { subject_id: number } | { subject_id: number }[] | null;
};

type GslDbRow = {
  curriculum_subject_id: number;
  grade_level_id: number;
  curriculum_subjects: { subject_id: number } | { subject_id: number }[] | null;
};

type CoordDbRow = {
  subject_group_id: number;
  subject_groups: { name: string } | { name: string }[] | null;
};

type MemberDbRow = { curriculum_subject_id: number | null };

// ─── Helper ───────────────────────────────────────────────────────────────────

function first<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

// ─── DB fetch (2 round-trips max) ─────────────────────────────────────────────

async function fetchFromDB(uid: string, activeSyId: number): Promise<UserContext> {
  // Round-trip 1: 5 parallel queries, all flat or shallow (max 2-level join)
  const [advisoryResult, teachingResult, gslResult, coordResult, gradeLevelsResult] =
    await Promise.all([
      // 1. Advisory sections — flat query, indexed on adviser_id
      adminClient
        .from("sections")
        .select("section_id, name, grade_level_id")
        .eq("adviser_id", uid)
        .eq("sy_id", activeSyId)
        .is("deleted_at", null),

      // 2. Teaching: tca → sections (name, grade) + curriculum_subjects (subject_id)
      //    2 separate joins at 1 level each; filter by sections.sy_id
      adminClient
        .from("teacher_class_assignments")
        .select(
          "section_id, curriculum_subject_id, sections!inner(name, grade_level_id), curriculum_subjects!inner(subject_id)",
        )
        .eq("teacher_id", uid)
        .eq("sections.sy_id", activeSyId)
        .is("deleted_at", null),

      // 3. GSL: gsl → curriculum_subjects (subject_id); grade_level_id is on the row itself
      adminClient
        .from("grade_subject_leaders")
        .select("curriculum_subject_id, grade_level_id, curriculum_subjects!inner(subject_id)")
        .eq("user_id", uid)
        .eq("sy_id", activeSyId)
        .is("deleted_at", null)
        .maybeSingle(),

      // 4. Coordinator: sc → subject_groups (name only); members fetched separately in R2
      //    to apply deleted_at filter cleanly
      adminClient
        .from("subject_coordinators")
        .select("subject_group_id, subject_groups!inner(name)")
        .eq("user_id", uid)
        .eq("sy_id", activeSyId)
        .is("deleted_at", null)
        .maybeSingle(),

      // 5. Grade levels: 6-row lookup table — fetched flat, joined in JS
      adminClient.from("grade_levels").select("grade_level_id, display_name"),
    ]);

  // Build grade level display name map
  const glMap = new Map<number, string>(
    ((gradeLevelsResult.data ?? []) as GlRow[]).map((r) => [r.grade_level_id, r.display_name]),
  );

  // Collect subject_ids from teaching + GSL for the batch subjects fetch in R2
  const teachingRows = (teachingResult.data ?? []) as TeachingDbRow[];
  const gslRow = gslResult.data as GslDbRow | null;
  const coordRow = coordResult.data as CoordDbRow | null;

  const subjectIdSet = new Set<number>();
  for (const row of teachingRows) {
    const cs = first(row.curriculum_subjects);
    if (cs?.subject_id != null) subjectIdSet.add(cs.subject_id);
  }
  if (gslRow) {
    const cs = first(gslRow.curriculum_subjects);
    if (cs?.subject_id != null) subjectIdSet.add(cs.subject_id);
  }

  const subjectIds = [...subjectIdSet];
  const coordGroupId = coordRow?.subject_group_id ?? null;
  const needsR2 = subjectIds.length > 0 || coordGroupId != null;

  // Round-trip 2: batch subject names + coordinator members (parallel, conditional)
  let subjectMap = new Map<number, string>();
  let coordMemberIds: number[] = [];

  if (needsR2) {
    const [subjectsResult, membersResult] = await Promise.all([
      subjectIds.length > 0
        ? adminClient
            .from("subjects")
            .select("subject_id, name")
            .in("subject_id", subjectIds)
        : Promise.resolve({ data: [] as SubjectRow[], error: null }),

      coordGroupId != null
        ? adminClient
            .from("subject_group_members")
            .select("curriculum_subject_id")
            .eq("subject_group_id", coordGroupId)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as MemberDbRow[], error: null }),
    ]);

    subjectMap = new Map<number, string>(
      ((subjectsResult.data ?? []) as SubjectRow[]).map((r) => [r.subject_id, r.name]),
    );

    coordMemberIds = ((membersResult.data ?? []) as MemberDbRow[])
      .map((r) => r.curriculum_subject_id)
      .filter((id): id is number => id != null);
  }

  // ── Build advisory sections ────────────────────────────────────────────────
  const advisorySections: UserContextAdvisorySection[] = (
    (advisoryResult.data ?? []) as AdvisoryDbRow[]
  ).map((r) => ({
    section_id: r.section_id,
    name: r.name,
    grade_level_id: r.grade_level_id,
    grade_display_name: glMap.get(r.grade_level_id) ?? "",
  }));

  // ── Build teaching assignments (deduplicate section×subject pairs) ─────────
  const seen = new Set<string>();
  const teachingAssignments: UserContextTeachingAssignment[] = [];
  for (const row of teachingRows) {
    const key = `${row.section_id}:${row.curriculum_subject_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const sec = first(row.sections);
    const cs = first(row.curriculum_subjects);
    if (!sec || !cs) continue;

    teachingAssignments.push({
      section_id: row.section_id,
      section_name: sec.name,
      grade_level_id: sec.grade_level_id,
      grade_display_name: glMap.get(sec.grade_level_id) ?? "",
      curriculum_subject_id: row.curriculum_subject_id,
      subject_id: cs.subject_id,
      subject_name: subjectMap.get(cs.subject_id) ?? "",
    });
  }

  // ── Build GSL ──────────────────────────────────────────────────────────────
  let gsl: UserContextGsl | null = null;
  if (gslRow) {
    const cs = first(gslRow.curriculum_subjects);
    if (cs) {
      gsl = {
        curriculum_subject_id: gslRow.curriculum_subject_id,
        grade_level_id: gslRow.grade_level_id,
        subject_id: cs.subject_id,
        subject_name: subjectMap.get(cs.subject_id) ?? "",
        grade_display_name: glMap.get(gslRow.grade_level_id) ?? "",
      };
    }
  }

  // ── Build coordinator ──────────────────────────────────────────────────────
  let coordinator: UserContextCoordinator | null = null;
  if (coordRow && coordGroupId != null) {
    const group = first(coordRow.subject_groups);
    if (group) {
      coordinator = {
        subject_group_id: coordGroupId,
        subject_group_name: group.name,
        curriculum_subject_ids: coordMemberIds,
      };
    }
  }

  return {
    activeSyId,
    advisorySections,
    teachingAssignments,
    gsl,
    coordinator,
  };
}

// ─── Public cache API ─────────────────────────────────────────────────────────

export function userAssignmentsCacheKey(uid: string): string {
  return `${KEY_PREFIX}:${uid}`;
}

/**
 * Returns the cached user context (advisory, teaching load, GSL, coordinator).
 * Populated on first call per user; expires after CACHE_TTL seconds or on explicit invalidation.
 * All routes that ask "what is this user responsible for?" should call this.
 */
export async function getUserAssignmentsContext(uid: string): Promise<UserContext> {
  const key = userAssignmentsCacheKey(uid);
  const cached = await redis.get<UserContext>(key);
  if (cached) return cached;

  const activeCtx = await getActiveContext();

  if (!activeCtx.sy_id) {
    const empty: UserContext = {
      activeSyId: null,
      advisorySections: [],
      teachingAssignments: [],
      gsl: null,
      coordinator: null,
    };
    await redis.set(key, empty, { ex: CACHE_TTL });
    return empty;
  }

  const context = await fetchFromDB(uid, activeCtx.sy_id);
  await redis.set(key, context, { ex: CACHE_TTL });
  return context;
}

/**
 * Evicts a user's context from Redis. Call after any mutation that changes
 * advisory, teaching load, GSL assignment, or coordinator assignment for that user.
 */
export async function invalidateUserAssignmentsContext(uid: string): Promise<void> {
  await redis.del(userAssignmentsCacheKey(uid));
}

// ─── Pure derived helpers (no DB, no Redis) ───────────────────────────────────

export function isAdviserOf(ctx: UserContext, sectionId: number): boolean {
  return ctx.advisorySections.some((s) => s.section_id === sectionId);
}

export function isTeacherOf(ctx: UserContext, sectionId: number): boolean {
  return ctx.teachingAssignments.some((a) => a.section_id === sectionId);
}

export function getTaughtSectionIds(ctx: UserContext): number[] {
  return [...new Set(ctx.teachingAssignments.map((a) => a.section_id))];
}

export function getAdvisedSectionIds(ctx: UserContext): number[] {
  return ctx.advisorySections.map((s) => s.section_id);
}

/**
 * Derives the AssignedScope fields that are fully contained in UserContext.
 * glSectionIds and subjectSectionIds require cross-teacher queries and are
 * returned as empty arrays — callers that need them (GSL/coordinator roles)
 * must fetch them separately.
 */
export function derivePartialScope(ctx: UserContext): AssignedScope {
  const sectionIds = getTaughtSectionIds(ctx);
  const subjectIds = [...new Set(ctx.teachingAssignments.map((a) => a.subject_id))];
  const taughtCsIds = ctx.teachingAssignments.map((a) => a.curriculum_subject_id);
  const gslCsIds = ctx.gsl ? [ctx.gsl.curriculum_subject_id] : [];

  return {
    sectionIds,
    subjectIds,
    curriculumSubjectIds: [...new Set([...taughtCsIds, ...gslCsIds])],
    assignedPairs: ctx.teachingAssignments.map((a) => ({
      sectionId: a.section_id,
      curriculumSubjectId: a.curriculum_subject_id,
    })),
    advisorySectionIds: getAdvisedSectionIds(ctx),
    glCurriculumSubjectIds: gslCsIds,
    coordinatorCurriculumSubjectIds: ctx.coordinator?.curriculum_subject_ids ?? [],
    // Require cross-teacher queries — see getAssignedScopeForUser below
    glSectionIds: [],
    subjectSectionIds: [],
  };
}

/**
 * Returns a full AssignedScope for the given user.
 * Reads base fields from Redis (free after first call).
 * Only runs additional DB queries for glSectionIds / subjectSectionIds when
 * the caller signals they are actually needed (i.e. the user has GSL or
 * coordinator permissions). This keeps the hot path (regular teachers) at
 * zero DB hits.
 */
export async function getAssignedScopeForUser(
  uid: string,
  options: {
    needsGlSections: boolean;     // pass true when user has reports.monitor_grade_level
    needsSubjectSections: boolean; // pass true when user has reports.monitor_subjects
  },
): Promise<AssignedScope> {
  const ctx = await getUserAssignmentsContext(uid);
  const base = derivePartialScope(ctx);

  const needsExtra =
    (options.needsGlSections && base.curriculumSubjectIds.length > 0) ||
    (options.needsSubjectSections && base.subjectIds.length > 0);

  if (!needsExtra) return base;

  // Fetch cross-teacher section sets — only runs for GSL / coordinator users
  const [glResult, subjectResult] = await Promise.all([
    options.needsGlSections && base.curriculumSubjectIds.length > 0
      ? adminClient
          .from("teacher_class_assignments")
          .select("section_id")
          .in("curriculum_subject_id", base.curriculumSubjectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),

    options.needsSubjectSections && base.subjectIds.length > 0
      ? adminClient
          .from("teacher_class_assignments")
          .select("section_id, curriculum_subjects!inner(subject_id)")
          .in("curriculum_subject_id", base.curriculumSubjectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const subjectIdSet = new Set(base.subjectIds);

  const glSectionIds = [
    ...new Set(
      ((glResult.data ?? []) as { section_id: number }[])
        .map((r) => r.section_id)
        .filter(Boolean),
    ),
  ];

  const subjectSectionIds = [
    ...new Set(
      ((subjectResult.data ?? []) as { section_id: number; curriculum_subjects: { subject_id: number } | { subject_id: number }[] | null }[])
        .filter((r) => {
          const cs = Array.isArray(r.curriculum_subjects)
            ? r.curriculum_subjects[0]
            : r.curriculum_subjects;
          return cs?.subject_id != null && subjectIdSet.has(cs.subject_id);
        })
        .map((r) => r.section_id)
        .filter(Boolean),
    ),
  ];

  return { ...base, glSectionIds, subjectSectionIds };
}
