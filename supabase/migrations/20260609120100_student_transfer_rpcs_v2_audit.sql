-- Student + transfer RPCs — add _audit envelopes (side-by-side _v2).
--
-- Originals return void (or uuid for create_transfer_request); adding the audit
-- envelope is a return-type change, so we add NEW *_v2 functions returning jsonb
-- alongside the live ones (no DROP/overwrite). Routes switch to the _v2 names.
-- Operational data the route still needs (request_id) lives at the result ROOT,
-- beside _audit. All audit data is computed in-transaction (zero extra reads),
-- names not ids.

-- ── move_student_enrollment_v2 ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_student_enrollment_v2(p_lrn text, p_sy_id integer, p_section_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_student   text;
  v_from_name text;
  v_to_name   text;
BEGIN
  -- Capture names BEFORE the move (the old enrollment is soft-deleted below).
  SELECT full_name INTO v_student FROM students WHERE lrn = p_lrn;

  SELECT s.name INTO v_from_name
  FROM enrollments e
  JOIN sections s ON s.section_id = e.section_id
  WHERE e.lrn = p_lrn AND e.sy_id = p_sy_id AND e.section_id <> p_section_id AND e.deleted_at IS NULL
  LIMIT 1;

  SELECT name INTO v_to_name FROM sections WHERE section_id = p_section_id;

  -- Original logic.
  UPDATE enrollments
  SET deleted_at = NOW()
  WHERE lrn = p_lrn AND sy_id = p_sy_id AND section_id <> p_section_id AND deleted_at IS NULL;

  PERFORM upsert_enrollment(p_lrn, p_section_id, p_sy_id);

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_student,
      'new', jsonb_build_object('student', v_student, 'from_section', v_from_name, 'to_section', v_to_name)
    )
  );
END;
$function$;

-- ── update_student_info_v2 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_student_info_v2(
  p_old_lrn text, p_new_lrn text,
  p_last_name character varying, p_first_name character varying,
  p_middle_name character varying, p_sex character
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_middle_name varchar := NULLIF(trim(p_middle_name), '');
  v_old_last    varchar;
  v_old_first   varchar;
  v_old_middle  varchar;
  v_old_sex     char;
  v_new_full    text;
BEGIN
  SELECT last_name, first_name, middle_name, sex
  INTO v_old_last, v_old_first, v_old_middle, v_old_sex
  FROM students WHERE lrn = p_old_lrn;

  IF p_old_lrn = p_new_lrn THEN
    UPDATE students
    SET last_name = p_last_name, first_name = p_first_name, middle_name = v_middle_name, sex = p_sex
    WHERE lrn = p_old_lrn;
  ELSE
    INSERT INTO students (lrn, last_name, first_name, middle_name, sex)
    VALUES (p_new_lrn, p_last_name, p_first_name, v_middle_name, p_sex);
    UPDATE enrollments SET lrn = p_new_lrn WHERE lrn = p_old_lrn;
    DELETE FROM students WHERE lrn = p_old_lrn;
  END IF;

  SELECT full_name INTO v_new_full FROM students WHERE lrn = p_new_lrn;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_new_full,
      'old', jsonb_build_object('lrn', p_old_lrn, 'last_name', v_old_last, 'first_name', v_old_first, 'middle_name', v_old_middle, 'sex', v_old_sex),
      'new', jsonb_build_object('lrn', p_new_lrn, 'last_name', p_last_name, 'first_name', p_first_name, 'middle_name', v_middle_name, 'sex', p_sex)
    )
  );
END;
$function$;

-- ── soft_delete_student_v2 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_student_v2(p_lrn text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_student  text;
  v_sections text;
BEGIN
  -- Capture name + current rosters BEFORE soft-deleting enrollments.
  SELECT full_name INTO v_student FROM students WHERE lrn = p_lrn;

  SELECT string_agg(DISTINCT s.name, ', ') INTO v_sections
  FROM enrollments e
  JOIN sections s ON s.section_id = e.section_id
  WHERE e.lrn = p_lrn AND e.deleted_at IS NULL;

  UPDATE students
  SET deleted_at = NOW()
  WHERE lrn = p_lrn AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found or already deleted';
  END IF;

  UPDATE enrollments
  SET deleted_at = NOW()
  WHERE lrn = p_lrn AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_student,
      'new', jsonb_build_object('student', v_student, 'section', v_sections)
    )
  );
END;
$function$;

-- ── create_transfer_request_v2 (root request_id + _audit) ───────────────────
CREATE OR REPLACE FUNCTION public.create_transfer_request_v2(
  p_lrn text, p_from_section_id integer, p_to_section_id integer, p_requested_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id uuid;
  v_student    text;
  v_from_name  text;
  v_to_name    text;
BEGIN
  -- Lock the student's enrollment row to prevent concurrent requests
  PERFORM 1 FROM enrollments
  WHERE lrn = p_lrn AND section_id = p_from_section_id AND deleted_at IS NULL
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM section_transfer_requests
    WHERE lrn = p_lrn AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'ALREADY_PENDING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE lrn = p_lrn AND section_id = p_from_section_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_ENROLLED';
  END IF;

  INSERT INTO section_transfer_requests (lrn, from_section_id, to_section_id, requested_by)
  VALUES (p_lrn, p_from_section_id, p_to_section_id, p_requested_by)
  RETURNING request_id INTO v_request_id;

  SELECT full_name INTO v_student   FROM students WHERE lrn = p_lrn;
  SELECT name       INTO v_from_name FROM sections WHERE section_id = p_from_section_id;
  SELECT name       INTO v_to_name   FROM sections WHERE section_id = p_to_section_id;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    '_audit', jsonb_build_object(
      'label', v_student,
      'new', jsonb_build_object('student', v_student, 'from_section', v_from_name, 'to_section', v_to_name)
    )
  );
END;
$function$;

-- ── approve_transfer_request_v2 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_transfer_request_v2(p_request_id uuid, p_reviewed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_req       section_transfer_requests%ROWTYPE;
  v_sy_id     integer;
  v_student   text;
  v_from_name text;
  v_to_name   text;
BEGIN
  SELECT * INTO v_req FROM section_transfer_requests
  WHERE request_id = p_request_id FOR UPDATE;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING';
  END IF;

  SELECT sy_id INTO v_sy_id FROM enrollments
  WHERE lrn = v_req.lrn AND section_id = v_req.from_section_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_sy_id IS NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND';
  END IF;

  UPDATE enrollments
  SET deleted_at = now()
  WHERE lrn = v_req.lrn AND section_id = v_req.from_section_id AND deleted_at IS NULL;

  -- Restore-or-insert into the target section. A blind INSERT would violate the
  -- FULL unique (lrn, section_id, sy_id) constraint when the student has a prior
  -- SOFT-DELETED enrollment in that section (the original RPC's latent bug).
  -- upsert_enrollment revives the soft-deleted row or inserts a fresh one — the
  -- same pattern move_student_enrollment uses.
  PERFORM upsert_enrollment(v_req.lrn, v_req.to_section_id, v_sy_id);

  UPDATE section_transfer_requests
  SET status = 'APPROVED', reviewed_by = p_reviewed_by, reviewed_at = now()
  WHERE request_id = p_request_id;

  SELECT full_name INTO v_student   FROM students WHERE lrn = v_req.lrn;
  SELECT name       INTO v_from_name FROM sections WHERE section_id = v_req.from_section_id;
  SELECT name       INTO v_to_name   FROM sections WHERE section_id = v_req.to_section_id;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_student,
      'new', jsonb_build_object('student', v_student, 'from_section', v_from_name, 'to_section', v_to_name)
    )
  );
END;
$function$;
