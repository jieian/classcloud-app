-- Profile + exam-create RPCs — add _audit envelopes (side-by-side _v2).
--
-- update_my_profile returns void; create_exams_for_sections returns a TABLE.
-- Both are return-type changes, so we add NEW *_v2 functions returning jsonb
-- alongside the live ones (routes switch to the _v2 names). Operational data the
-- route needs (the created exam rows) lives at the result ROOT under `exams`,
-- beside _audit. All audit data is computed in-transaction (zero extra reads).

-- ── update_my_profile_v2 ────────────────────────────────────────────────────
-- Still SECURITY DEFINER + auth.uid(): the route calls it with the user-scoped
-- client so auth.uid() resolves to the caller.
CREATE OR REPLACE FUNCTION public.update_my_profile_v2(p_first_name text, p_middle_name text, p_last_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_old_first  text;
  v_old_middle text;
  v_old_last   text;
BEGIN
  SELECT first_name, middle_name, last_name
  INTO v_old_first, v_old_middle, v_old_last
  FROM users
  WHERE uid = v_uid AND active_status = 1 AND deleted_at IS NULL;

  UPDATE users
  SET
    first_name  = p_first_name,
    middle_name = NULLIF(TRIM(p_middle_name), ''),
    last_name   = p_last_name
  WHERE uid           = v_uid
    AND active_status = 1
    AND deleted_at    IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', NULLIF(TRIM(p_first_name || ' ' || p_last_name), ''),
      'old', jsonb_build_object('first_name', v_old_first, 'middle_name', v_old_middle, 'last_name', v_old_last),
      'new', jsonb_build_object('first_name', p_first_name, 'middle_name', NULLIF(TRIM(p_middle_name), ''), 'last_name', p_last_name)
    )
  );
END;
$function$;

-- ── create_exams_for_sections_v2 (TABLE -> jsonb) ───────────────────────────
CREATE OR REPLACE FUNCTION public.create_exams_for_sections_v2(p_creator_teacher_id uuid, p_curriculum_subject_id integer, p_quarter_id integer, p_exam_date text, p_total_items integer, p_description text, p_sections jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry      jsonb;
  v_exam_id    integer;
  v_section_id integer;
  v_exams      jsonb := '[]'::jsonb;
  v_subject    text;
  v_quarter    text;
  v_sections   text;
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

    -- Root operational payload (route reads data.exams).
    v_exams := v_exams || jsonb_build_object('exam_id', v_exam_id, 'section_id', v_section_id);
  END LOOP;

  -- Names for the audit log.
  SELECT subj.name INTO v_subject
  FROM curriculum_subjects cs
  JOIN subjects subj ON subj.subject_id = cs.subject_id
  WHERE cs.curriculum_subject_id = p_curriculum_subject_id;

  SELECT name INTO v_quarter FROM quarters WHERE quarter_id = p_quarter_id;

  SELECT string_agg(s.name, ', ' ORDER BY s.name) INTO v_sections
  FROM jsonb_array_elements(p_sections) e
  JOIN sections s ON s.section_id = (e->>'section_id')::integer;

  RETURN jsonb_build_object(
    'exams', v_exams,
    '_audit', jsonb_build_object(
      'label', v_subject,
      'new', jsonb_build_object(
        'subject',     v_subject,
        'quarter',     v_quarter,
        'sections',    v_sections,
        'total_items', p_total_items,
        'exam_count',  jsonb_array_length(v_exams)
      ),
      'metadata', jsonb_build_object(
        'exam_ids', (SELECT jsonb_agg((e->>'exam_id')::int) FROM jsonb_array_elements(v_exams) e)
      )
    )
  );
END;
$function$;
