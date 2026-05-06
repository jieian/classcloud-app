-- Prevents duplicate exams: same section + subject + term.
-- Applied as a constraint trigger so concurrent inserts are also caught.

CREATE OR REPLACE FUNCTION check_exam_assignment_duplicate()
RETURNS TRIGGER AS $$
DECLARE
  v_curriculum_subject_id integer;
  v_quarter_id            integer;
BEGIN
  SELECT curriculum_subject_id, quarter_id
    INTO v_curriculum_subject_id, v_quarter_id
    FROM exams
   WHERE exam_id = NEW.exam_id;

  IF EXISTS (
    SELECT 1
      FROM exam_assignments ea
      JOIN exams e ON e.exam_id = ea.exam_id
     WHERE ea.section_id              = NEW.section_id
       AND e.curriculum_subject_id    = v_curriculum_subject_id
       AND e.quarter_id               = v_quarter_id
       AND e.deleted_at              IS NULL
       AND ea.exam_id                != NEW.exam_id
  ) THEN
    RAISE EXCEPTION
      'An examination for this subject, grade level, and section already exists for the active term.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_exam ON exam_assignments;

CREATE CONSTRAINT TRIGGER trg_prevent_duplicate_exam
  AFTER INSERT ON exam_assignments
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_exam_assignment_duplicate();
