-- Fix duplicate unique constraints on report tables (old auto-named vs explicit).
-- The original unique constraints were created as table constraints (backed by implicit indexes);
-- the migration 20260524 added explicit named indexes on the same columns — now both exist.
-- The ON CONFLICT clauses in finalize_exam_reports_atomic will use the remaining explicit indexes.
ALTER TABLE public.exam_results_reports DROP CONSTRAINT IF EXISTS exam_results_reports_exam_id_section_id_key;
ALTER TABLE public.item_analysis_reports DROP CONSTRAINT IF EXISTS item_analysis_reports_exam_id_section_id_key;

-- exam_assignments: add exam_id index for the FK join to exams.
-- The reports browse query does a full scan of exam_assignments joined to exams
-- with no filter on exam_assignments itself; the planner needs this for nested loop joins.
CREATE INDEX IF NOT EXISTS idx_exam_assignments_exam_id
  ON public.exam_assignments (exam_id);

-- sections: add (sy_id, deleted_at) index.
-- getActiveSectionsCached / fetchActiveSectionsForReports both filter:
--   WHERE deleted_at IS NULL AND sy_id = $active_sy ORDER BY name
CREATE INDEX IF NOT EXISTS idx_sections_sy_id_active
  ON public.sections (sy_id)
  WHERE deleted_at IS NULL;

-- teacher_class_assignments: add (section_id) partial index.
-- Used in two patterns:
--   1. Bulk fetch: WHERE deleted_at IS NULL (full scan — partial index shrinks scan set)
--   2. Per-section fetch: WHERE section_id = $1 AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_teacher_class_assignments_section_id_active
  ON public.teacher_class_assignments (section_id)
  WHERE deleted_at IS NULL;

-- teacher_class_assignments: add (section_id, curriculum_subject_id) for the subquery
-- inside finalize_exam_reports_atomic that runs once per assignment in the loop:
--   WHERE section_id = $1 AND curriculum_subject_id = $2 AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_teacher_class_assignments_section_cs_active
  ON public.teacher_class_assignments (section_id, curriculum_subject_id)
  WHERE deleted_at IS NULL;
