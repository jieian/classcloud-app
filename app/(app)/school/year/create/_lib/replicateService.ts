import type {
  FacultyCellKey,
  CoordinatorDraftMap,
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardSection,
  WizardSubjectGroup,
} from "./types";

/**
 * Step 3 replication — O(n + g)
 * Filters prev sections to those whose grade level still exists in the new curriculum.
 * Assigns new tempIds (client-only stable keys).
 */
export function replicateSections(
  snapshot: PreviousSySnapshot,
  newCurriculumDetail: WizardCurriculumDetail
): WizardSection[] {
  const validGlIds = new Set(
    newCurriculumDetail.grade_levels.map((gl) => gl.grade_level_id)
  );
  return snapshot.sections
    .filter((s) => validGlIds.has(s.grade_level_id))
    .map((s) => ({
      tempId: crypto.randomUUID(),
      name: s.name,
      grade_level_id: s.grade_level_id,
      section_type: s.section_type,
    }));
}

/**
 * Step 4 replication — O(n * m) unavoidable (n sections × m subjects per grade)
 * All per-iteration lookups are O(1) via pre-built Maps.
 *
 * @param newSections - already-replicated sections (with new tempIds)
 * @param snapshot    - raw prev SY snapshot (uses section_id for adviser/subject matching)
 */
export function replicateFacultyDraft(
  newSections: WizardSection[],
  snapshot: PreviousSySnapshot,
  newCurriculumDetail: WizardCurriculumDetail
): Map<FacultyCellKey, string | null> {
  // Build O(1) lookup: "name:grade_level_id" → prev section
  const oldSectionByKey = new Map(
    snapshot.sections.map((s) => [`${s.name.toLowerCase().trim()}:${s.grade_level_id}`, s])
  );

  // Build O(1) lookup: subject_id → curriculum_subject_id in the NEW curriculum
  const newCsIdBySubjectId = new Map<number, number>();
  for (const gl of newCurriculumDetail.grade_levels) {
    for (const sub of gl.subjects) {
      newCsIdBySubjectId.set(sub.subject_id, sub.curriculum_subject_id);
    }
  }

  // Build O(1) lookup: old section_id → { adviser_id, assignments: Map<subject_id, teacher_id> }
  const oldAssignmentsBySection = new Map<
    number,
    { adviser_id: string | null; bySubjectId: Map<number, string> }
  >();
  for (const prevSection of snapshot.sections) {
    oldAssignmentsBySection.set(prevSection.section_id, {
      adviser_id: prevSection.adviser_id,
      bySubjectId: new Map(),
    });
  }
  for (const a of snapshot.assignments) {
    const entry = oldAssignmentsBySection.get(a.section_id);
    if (entry) entry.bySubjectId.set(a.subject_id, a.teacher_id);
  }

  // Build O(1) lookup: grade_level_id → subjects list
  const subjectsByGl = new Map(
    newCurriculumDetail.grade_levels.map((gl) => [gl.grade_level_id, gl.subjects])
  );

  const draft = new Map<FacultyCellKey, string | null>();

  for (const section of newSections) {
    const key = `${section.name.toLowerCase().trim()}:${section.grade_level_id}`;
    const prevSection = oldSectionByKey.get(key);
    if (!prevSection) continue;

    const prevData = oldAssignmentsBySection.get(prevSection.section_id);
    if (!prevData) continue;

    // Adviser
    if (prevData.adviser_id) {
      draft.set(`adviser:${section.tempId}`, prevData.adviser_id);
    }

    // Subject assignments — only replicate subjects applicable to this section type
    const glSubjects = subjectsByGl.get(section.grade_level_id) ?? [];
    for (const sub of glSubjects) {
      if (sub.subject_type === "SSES" && section.section_type !== "SSES") continue;
      const newCsId = newCsIdBySubjectId.get(sub.subject_id);
      if (newCsId === undefined) continue; // subject removed from new curriculum
      const teacherId = prevData.bySubjectId.get(sub.subject_id);
      if (teacherId) {
        draft.set(`subject:${section.tempId}:${newCsId}`, teacherId);
      }
    }
  }

  return draft;
}

/**
 * Step 5 replication — O(g) where g = new subject groups
 * Matches by subject group name (case-insensitive trim).
 */
export function replicateCoordinatorDraft(
  snapshot: PreviousSySnapshot,
  newSubjectGroups: WizardSubjectGroup[]
): CoordinatorDraftMap {
  const oldByName = new Map(
    snapshot.coordinators.map((c) => [
      c.subject_group_name.toLowerCase().trim(),
      c.user_id,
    ])
  );

  const draft: CoordinatorDraftMap = new Map();
  for (const group of newSubjectGroups) {
    const userId = oldByName.get(group.name.toLowerCase().trim()) ?? null;
    draft.set(group.subject_group_id, userId);
  }
  return draft;
}
