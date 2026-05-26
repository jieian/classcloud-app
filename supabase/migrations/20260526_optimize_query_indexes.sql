-- teacher_class_assignments: partial index on teacher_id.
-- fetchMyAssignedScope query 1 filters: WHERE teacher_id = $1 AND deleted_at IS NULL
-- Existing partial indexes cover section_id and curriculum_subject_id but not teacher_id.
CREATE INDEX IF NOT EXISTS idx_teacher_class_assignments_teacher_id_active
  ON public.teacher_class_assignments (teacher_id)
  WHERE deleted_at IS NULL;

-- teacher_class_assignments: partial index on curriculum_subject_id.
-- fetchMyAssignedScope query 3 filters: WHERE curriculum_subject_id = ANY($1) AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_teacher_class_assignments_cs_id_active
  ON public.teacher_class_assignments (curriculum_subject_id)
  WHERE deleted_at IS NULL;

-- quarters: composite index for active-quarter lookups.
-- Pattern used across examService, quarterService, etc.: WHERE sy_id = $1 AND is_active = true
CREATE INDEX IF NOT EXISTS idx_quarters_sy_id_is_active
  ON public.quarters (sy_id, is_active);

-- exam_results_reports: index on sy_id to support the school-year-scoped finalized-keys query.
-- fetchFinalizedReportKeys now filters: WHERE sy_id = $1
CREATE INDEX IF NOT EXISTS idx_exam_results_reports_sy_id
  ON public.exam_results_reports (sy_id);
