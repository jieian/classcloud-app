-- C2 — Bulk exam creation.
--
-- Replaces the per-section insert loop in app/api/exams/create/route.ts (2
-- round-trips per section + JS-side rollback) with ONE atomic RPC call: insert
-- one exam + one exam_assignment per section in a single transaction. Any
-- failure rolls the whole batch back automatically — no manual cleanup needed.
--
-- p_sections is a JSONB array of { "section_id": int, "title": text }. Returns
-- the created (exam_id, section_id) pairs so the caller can report exam_ids.

CREATE OR REPLACE FUNCTION public.create_exams_for_sections(
  p_creator_teacher_id   uuid,
  p_curriculum_subject_id integer,
  p_quarter_id           integer,
  p_exam_date            text,
  p_total_items          integer,
  p_description          text,
  p_sections             jsonb
)
RETURNS TABLE(exam_id integer, section_id integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_entry      jsonb;
  v_exam_id    integer;
  v_section_id integer;
BEGIN
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_section_id := (v_entry->>'section_id')::integer;

    INSERT INTO exams (
      title, total_items, exam_date, curriculum_subject_id,
      quarter_id, description, creator_teacher_id, is_locked
    )
    VALUES (
      v_entry->>'title', p_total_items, (p_exam_date)::date, p_curriculum_subject_id,
      p_quarter_id, p_description, p_creator_teacher_id, false
    )
    RETURNING exams.exam_id INTO v_exam_id;

    INSERT INTO exam_assignments (exam_id, section_id)
    VALUES (v_exam_id, v_section_id);

    exam_id := v_exam_id;
    section_id := v_section_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
