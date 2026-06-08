-- Item 2 (B1) — Bulk enrollment upsert.
--
-- Replaces the per-student upsert_enrollment() loop in the roster import
-- (app/api/classes/[sectionId]/students/import/route.ts) with a single
-- set-based call: 1 RPC round-trip per import instead of 1 per student.
--
-- Accepts a JSONB array of { "lrn": text, "section_id": int, "sy_id": int } and
-- applies the same semantics as single-row upsert_enrollment():
--   * revive a matching soft-deleted enrollment, OR
--   * insert a brand-new enrollment, OR
--   * leave an already-active matching enrollment untouched (idempotent).
--
-- Like upsert_enrollment(), it locks the involved students FOR UPDATE first to
-- serialize concurrent enrollment writes. Callers must NOT pass students who
-- already hold an ACTIVE enrollment in a different section for the same sy_id —
-- the import classifies those as "move" (handled by move_student_enrollment),
-- and the uq_enrollments_lrn_sy_active partial-unique index would reject them.

CREATE OR REPLACE FUNCTION public.upsert_enrollments(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  -- Serialize concurrent enrollment writes for the same students.
  PERFORM 1
  FROM students s
  JOIN jsonb_to_recordset(p_rows) AS r(lrn text, section_id int, sy_id int)
    ON s.lrn = r.lrn
  FOR UPDATE OF s;

  -- Revive soft-deleted matches.
  UPDATE enrollments e
  SET deleted_at = NULL
  FROM jsonb_to_recordset(p_rows) AS r(lrn text, section_id int, sy_id int)
  WHERE e.lrn        = r.lrn
    AND e.section_id = r.section_id
    AND e.sy_id      = r.sy_id
    AND e.deleted_at IS NOT NULL;

  -- Insert rows that have no existing enrollment at all.
  INSERT INTO enrollments (lrn, section_id, sy_id)
  SELECT DISTINCT r.lrn, r.section_id, r.sy_id
  FROM jsonb_to_recordset(p_rows) AS r(lrn text, section_id int, sy_id int)
  WHERE NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.lrn        = r.lrn
      AND e.section_id = r.section_id
      AND e.sy_id      = r.sy_id
  );
END;
$$;
