-- Curriculum + school-year RPCs — add _audit envelopes (side-by-side _v2).
--
-- These originals ALREADY return jsonb, so adding _audit is technically a
-- non-breaking CREATE OR REPLACE. We still add NEW *_v2 functions rather than
-- overwrite the live ones: it keeps the working functions as an untouched
-- fallback (esp. the ~100-line update_curriculum_full), isolates any transcription
-- error to the function under test, and stays uniform with the other envelopes
-- (all promote together later). Each _v2 preserves every original return key and
-- ADDS _audit. Labels for DELETE paths are read WITHOUT a deleted_at filter, since
-- the row being purged may already be soft-deleted. None of these do a blind
-- INSERT, so the approve_transfer_request soft-delete/unique collision can't occur.

-- ── delete_curriculum_v2 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_curriculum_v2(p_curriculum_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cs_ids          integer[];
  v_old_subject_ids integer[];
  v_exam_count      integer;
  v_name            text;
BEGIN
  -- Capture label before any deletes (curriculum row is hard-deleted below).
  SELECT name INTO v_name FROM curriculums WHERE curriculum_id = p_curriculum_id;

  IF EXISTS (SELECT 1 FROM school_years WHERE curriculum_id = p_curriculum_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Curriculum is used by a school year and cannot be deleted.');
  END IF;

  SELECT ARRAY_AGG(curriculum_subject_id) INTO v_cs_ids
  FROM curriculum_subjects WHERE curriculum_id = p_curriculum_id;

  IF v_cs_ids IS NOT NULL AND array_length(v_cs_ids, 1) > 0 THEN
    SELECT COUNT(*) INTO v_exam_count FROM exams WHERE curriculum_subject_id = ANY(v_cs_ids);
    IF v_exam_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Curriculum subjects are referenced by exams and cannot be deleted.');
    END IF;
  END IF;

  -- Collect subject_ids before wipe
  SELECT ARRAY_AGG(DISTINCT subject_id) INTO v_old_subject_ids
  FROM curriculum_subjects WHERE curriculum_id = p_curriculum_id;

  DELETE FROM subject_group_members
  WHERE subject_group_id IN (SELECT subject_group_id FROM subject_groups WHERE curriculum_id = p_curriculum_id);
  IF v_cs_ids IS NOT NULL THEN
    DELETE FROM teacher_class_assignments WHERE curriculum_subject_id = ANY(v_cs_ids);
  END IF;
  DELETE FROM subject_groups WHERE curriculum_id = p_curriculum_id;
  DELETE FROM curriculum_subjects WHERE curriculum_id = p_curriculum_id;
  DELETE FROM curriculums WHERE curriculum_id = p_curriculum_id;

  -- Hard-delete subjects no longer used by any curriculum
  IF v_old_subject_ids IS NOT NULL THEN
    DELETE FROM subjects
    WHERE subject_id = ANY(v_old_subject_ids)
    AND NOT EXISTS (
      SELECT 1 FROM curriculum_subjects cs WHERE cs.subject_id = subjects.subject_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    '_audit', jsonb_build_object('label', v_name)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- ── delete_school_year_permanent_v2 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_school_year_permanent_v2(p_sy_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_label text;
BEGIN
  -- Label read WITHOUT a deleted_at filter: this can purge an already
  -- soft-deleted school year, and we still want its year range for the log.
  SELECT start_year::text || '–' || end_year::text
  INTO v_label
  FROM school_years WHERE sy_id = p_sy_id;

  -- Guard: refuse if any exam is linked through this SY's quarters
  IF EXISTS (
    SELECT 1
    FROM exams e
    JOIN quarters q ON q.quarter_id = e.quarter_id
    WHERE q.sy_id = p_sy_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'HAS_EXAMS');
  END IF;

  -- Single delete; CASCADE handles quarters, sections, enrollments, etc.
  DELETE FROM school_years WHERE sy_id = p_sy_id;

  RETURN jsonb_build_object(
    'success', true,
    '_audit', jsonb_build_object('label', v_label)
  );
END;
$function$;

-- ── toggle_quarter_v2 ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_quarter_v2(p_quarter_id integer, p_sy_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_quarter_id INT;
  v_incomplete_count  INT;
  v_from_name         text;
  v_to_name           text;
BEGIN
  -- Find which quarter is currently active for this school year
  SELECT quarter_id INTO v_active_quarter_id
  FROM quarters
  WHERE sy_id = p_sy_id AND is_active = true;

  -- No-op if already active (no _audit — nothing changed)
  IF v_active_quarter_id = p_quarter_id THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  -- Validate reports before switching
  IF v_active_quarter_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_incomplete_count
    FROM teacher_class_assignments tca
    JOIN sections s ON s.section_id = tca.section_id
    WHERE s.sy_id      = p_sy_id
      AND s.deleted_at  IS NULL
      AND tca.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM exam_results_reports r
        WHERE r.section_id            = tca.section_id
          AND r.curriculum_subject_id = tca.curriculum_subject_id
          AND r.quarter_id            = v_active_quarter_id
      );

    IF v_incomplete_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'REPORTS_INCOMPLETE');
    END IF;
  END IF;

  -- Capture quarter names (unchanged by the switch) for the log
  SELECT name INTO v_from_name FROM quarters WHERE quarter_id = v_active_quarter_id;
  SELECT name INTO v_to_name   FROM quarters WHERE quarter_id = p_quarter_id AND sy_id = p_sy_id;

  -- Switch active quarter
  UPDATE quarters SET is_active = false WHERE sy_id      = p_sy_id;
  UPDATE quarters SET is_active = true  WHERE quarter_id = p_quarter_id
                                          AND sy_id      = p_sy_id;

  RETURN jsonb_build_object(
    'success', true,
    '_audit', jsonb_build_object(
      'label', v_to_name,
      'old', jsonb_build_object('quarter', v_from_name),
      'new', jsonb_build_object('quarter', v_to_name)
    )
  );
END;
$function$;

-- ── update_curriculum_full_v2 ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_curriculum_full_v2(p_curriculum_id integer, p_name text, p_description text, p_subjects jsonb, p_subject_groups jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subject                jsonb;
  v_group                  jsonb;
  v_subject_id             integer;
  v_curriculum_subject_id  integer;
  v_subject_group_id       integer;
  v_temp_id_map            jsonb    := '{}'::jsonb;
  v_member_temp_id         text;
  v_member_cs_id           integer;
  v_has_exams              boolean;
  v_is_imported            boolean;
  v_incoming_subject_ids   integer[];
  v_cs_to_remove           integer[];
  v_subjects_to_check      integer[];
  v_old_name               text;
BEGIN
  -- School year gate (soft-deleted school years excluded)
  IF EXISTS (
    SELECT 1 FROM school_years
    WHERE curriculum_id = p_curriculum_id
      AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Curriculum is in use by a school year and cannot be modified.');
  END IF;

  -- Capture old name before the metadata update (for the audit diff).
  SELECT name INTO v_old_name FROM curriculums WHERE curriculum_id = p_curriculum_id;

  -- Update curriculum metadata
  UPDATE curriculums
  SET name = p_name, description = p_description
  WHERE curriculum_id = p_curriculum_id;

  -- Collect subject_ids from the "existing" entries in the payload
  SELECT ARRAY_AGG((s->>'subject_id')::integer)
  INTO v_incoming_subject_ids
  FROM jsonb_array_elements(p_subjects) s
  WHERE s->>'source' = 'existing';

  IF v_incoming_subject_ids IS NULL THEN
    v_incoming_subject_ids := '{}'::integer[];
  END IF;

  -- Find rows to remove: old subjects not in payload AND no exam records
  SELECT ARRAY_AGG(cs.curriculum_subject_id)
  INTO v_cs_to_remove
  FROM curriculum_subjects cs
  WHERE cs.curriculum_id = p_curriculum_id
    AND NOT (cs.subject_id = ANY(v_incoming_subject_ids))
    AND NOT EXISTS (
      SELECT 1 FROM exams e WHERE e.curriculum_subject_id = cs.curriculum_subject_id
    );

  -- Track their subject_ids for orphan cleanup later
  SELECT ARRAY_AGG(DISTINCT cs.subject_id)
  INTO v_subjects_to_check
  FROM curriculum_subjects cs
  WHERE cs.curriculum_subject_id = ANY(COALESCE(v_cs_to_remove, '{}'::integer[]));

  IF v_cs_to_remove IS NOT NULL AND array_length(v_cs_to_remove, 1) > 0 THEN
    DELETE FROM teacher_class_assignments WHERE curriculum_subject_id = ANY(v_cs_to_remove);
    DELETE FROM curriculum_subjects        WHERE curriculum_subject_id = ANY(v_cs_to_remove);
  END IF;

  -- Nuke and rebuild subject groups (no external FK dependencies)
  DELETE FROM subject_group_members
  WHERE subject_group_id IN (
    SELECT subject_group_id FROM subject_groups WHERE curriculum_id = p_curriculum_id
  );
  DELETE FROM subject_groups WHERE curriculum_id = p_curriculum_id;

  -- Process each subject in the payload
  FOR v_subject IN SELECT * FROM jsonb_array_elements(p_subjects) LOOP

    IF v_subject->>'source' = 'new' THEN
      INSERT INTO subjects (code, name, description, subject_type)
      VALUES (
        v_subject->>'code',
        v_subject->>'name',
        v_subject->>'description',
        (v_subject->>'subject_type')::subject_type_enum
      )
      RETURNING subject_id INTO v_subject_id;

      INSERT INTO curriculum_subjects (curriculum_id, subject_id, grade_level_id)
      VALUES (p_curriculum_id, v_subject_id, (v_subject->>'grade_level_id')::integer)
      RETURNING curriculum_subject_id INTO v_curriculum_subject_id;

    ELSE
      v_subject_id := (v_subject->>'subject_id')::integer;

      -- Does this subject have exam records in any curriculum?
      SELECT EXISTS (
        SELECT 1
        FROM exams e
        JOIN curriculum_subjects cs ON cs.curriculum_subject_id = e.curriculum_subject_id
        WHERE cs.subject_id = v_subject_id
      ) INTO v_has_exams;

      -- Does this subject live in any other curriculum?
      SELECT EXISTS (
        SELECT 1 FROM curriculum_subjects cs
        WHERE cs.subject_id    = v_subject_id
          AND cs.curriculum_id <> p_curriculum_id
      ) INTO v_is_imported;

      -- Only update subject details when no exams and not imported
      IF NOT v_has_exams AND NOT v_is_imported THEN
        UPDATE subjects
        SET
          code         = v_subject->>'code',
          name         = v_subject->>'name',
          description  = v_subject->>'description',
          subject_type = (v_subject->>'subject_type')::subject_type_enum
        WHERE subject_id = v_subject_id;
      END IF;

      -- Preserve the existing curriculum_subject_id (keeps exam FK references intact)
      SELECT curriculum_subject_id INTO v_curriculum_subject_id
      FROM curriculum_subjects
      WHERE curriculum_id = p_curriculum_id AND subject_id = v_subject_id;

      IF v_curriculum_subject_id IS NULL THEN
        -- Newly added to this curriculum in this edit session
        INSERT INTO curriculum_subjects (curriculum_id, subject_id, grade_level_id)
        VALUES (p_curriculum_id, v_subject_id, (v_subject->>'grade_level_id')::integer)
        RETURNING curriculum_subject_id INTO v_curriculum_subject_id;
      ELSE
        -- Already here — only update grade_level if no exams
        IF NOT v_has_exams THEN
          UPDATE curriculum_subjects
          SET grade_level_id = (v_subject->>'grade_level_id')::integer
          WHERE curriculum_subject_id = v_curriculum_subject_id;
        END IF;
      END IF;
    END IF;

    v_temp_id_map := v_temp_id_map || jsonb_build_object(
      v_subject->>'tempId', v_curriculum_subject_id
    );
  END LOOP;

  -- Rebuild subject groups
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_subject_groups) LOOP
    INSERT INTO subject_groups (curriculum_id, name, description)
    VALUES (p_curriculum_id, v_group->>'name', v_group->>'description')
    RETURNING subject_group_id INTO v_subject_group_id;

    FOR v_member_temp_id IN SELECT jsonb_array_elements_text(v_group->'memberTempIds') LOOP
      v_member_cs_id := (v_temp_id_map->>v_member_temp_id)::integer;
      IF v_member_cs_id IS NOT NULL THEN
        INSERT INTO subject_group_members (subject_group_id, curriculum_subject_id)
        VALUES (v_subject_group_id, v_member_cs_id);
      END IF;
    END LOOP;
  END LOOP;

  -- Hard-delete subjects now orphaned (no longer in any curriculum)
  IF v_subjects_to_check IS NOT NULL AND array_length(v_subjects_to_check, 1) > 0 THEN
    DELETE FROM subjects
    WHERE subject_id = ANY(v_subjects_to_check)
      AND NOT EXISTS (
        SELECT 1 FROM curriculum_subjects cs WHERE cs.subject_id = subjects.subject_id
      );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'curriculum_id', p_curriculum_id,
    '_audit', jsonb_build_object(
      'label', p_name,
      'old', jsonb_build_object('name', v_old_name),
      'new', jsonb_build_object(
        'name', p_name,
        'subject_count', jsonb_array_length(p_subjects),
        'group_count', jsonb_array_length(p_subject_groups)
      )
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code',    'DUPLICATE_SUBJECT_CODE',
      'message', 'A subject with that code already exists.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
