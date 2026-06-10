-- Section RPCs — add _audit envelopes (side-by-side _v2; return void -> jsonb).
--
-- Each original function RETURNS void; adding the audit envelope is a return-type
-- change, so we add NEW *_v2 functions returning jsonb ALONGSIDE the live ones
-- (no DROP/overwrite of the in-use functions — the deployed app keeps calling the
-- v1s until the later promotion pass). Routes are switched to the _v2 names.
-- All audit data is computed in-transaction (zero extra reads), names not ids,
-- changed fields only.

-- ── rename_section_v2 ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rename_section_v2(p_section_id integer, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grade_level_id INT;
  v_sy_id          INT;
  v_old_name       TEXT;
  v_exists         BOOL;
BEGIN
  SELECT grade_level_id, sy_id, name INTO v_grade_level_id, v_sy_id, v_old_name
  FROM sections
  WHERE section_id = p_section_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Section not found.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM sections
    WHERE grade_level_id = v_grade_level_id
      AND sy_id          = v_sy_id
      AND LOWER(name)    = LOWER(p_name)
      AND section_id    != p_section_id
      AND deleted_at IS NULL
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Section name "%" is already taken for this grade level.', p_name;
  END IF;

  UPDATE sections SET name = p_name WHERE section_id = p_section_id;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', p_name,
      'old',   jsonb_build_object('name', v_old_name),
      'new',   jsonb_build_object('name', p_name)
    )
  );
END;
$function$;

-- ── set_section_adviser_v2 (generic setter; the route uses it to UNASSIGN) ──
CREATE OR REPLACE FUNCTION public.set_section_adviser_v2(p_section_id integer, p_adviser_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_adviser  uuid;
  v_section_name text;
  v_old_name     text;
  v_new_name     text;
BEGIN
  SELECT s.adviser_id, s.name INTO v_old_adviser, v_section_name
  FROM public.sections s WHERE s.section_id = p_section_id;

  UPDATE public.sections
  SET adviser_id = p_adviser_id
  WHERE section_id = p_section_id;

  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
  INTO v_old_name FROM public.users WHERE uid = v_old_adviser;

  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
  INTO v_new_name FROM public.users WHERE uid = p_adviser_id;

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_section_name,
      'old',   jsonb_build_object('adviser', v_old_name),
      'new',   jsonb_build_object('adviser', v_new_name)
    )
  );
END;
$function$;

-- ── assign_section_adviser_v2 (validated assign-when-unassigned) ────────────
CREATE OR REPLACE FUNCTION public.assign_section_adviser_v2(p_section_id integer, p_adviser_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_current_adviser uuid;
  v_section_name    text;
begin
  -- Concurrency guards (same adviser / same section clicked at once)
  perform pg_advisory_xact_lock(83001, p_section_id);
  perform pg_advisory_xact_lock(83002, hashtext(p_adviser_id::text));

  -- Section must exist and not be deleted; lock row for update
  select s.adviser_id, s.name
  into v_current_adviser, v_section_name
  from public.sections s
  where s.section_id = p_section_id
    and s.deleted_at is null
  for update;

  if not found then
    raise exception 'Section not found or deleted.';
  end if;

  -- This flow is "assign when unassigned"
  if v_current_adviser is not null then
    raise exception 'Section already has an adviser.';
  end if;

  -- Adviser user must exist and be active
  if not exists (
    select 1
    from public.users u
    where u.uid = p_adviser_id
      and u.active_status = 1
  ) then
    raise exception 'Adviser user not found or inactive.';
  end if;

  -- Adviser must have at least one faculty role
  if not exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.role_id = ur.role_id
    where ur.uid = p_adviser_id
      and r.is_faculty = true
  ) then
    raise exception 'Selected user is not faculty.';
  end if;

  -- Adviser must not already advise any non-deleted section
  if exists (
    select 1
    from public.sections s2
    where s2.adviser_id = p_adviser_id
      and s2.deleted_at is null
  ) then
    raise exception 'Selected faculty already has an advisory section.';
  end if;

  update public.sections
  set adviser_id = p_adviser_id
  where section_id = p_section_id
    and adviser_id is null
    and deleted_at is null;

  if not found then
    raise exception 'Assignment failed due to concurrent update.';
  end if;

  return jsonb_build_object(
    '_audit', jsonb_build_object(
      'label', v_section_name,
      'old',   jsonb_build_object('adviser', null),  -- always null in this flow (guarded above)
      'new',   jsonb_build_object(
        'adviser', (select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
                    from public.users where uid = p_adviser_id)
      )
    )
  );
end;
$function$;

-- ── set_section_subject_teachers_v2 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_section_subject_teachers_v2(p_section_id integer, p_assignments jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changes      jsonb;
  v_section_name text;
BEGIN
  SELECT name INTO v_section_name FROM public.sections WHERE section_id = p_section_id;

  -- Diff BEFORE replacing assignments (names, not ids; only cells that changed).
  WITH old_state AS (
    SELECT tca.curriculum_subject_id AS cs_id, tca.teacher_id
    FROM public.teacher_class_assignments tca
    WHERE tca.section_id = p_section_id AND tca.deleted_at IS NULL
  ),
  new_state AS (
    SELECT (a->>'curriculum_subject_id')::int AS cs_id,
           NULLIF(a->>'teacher_id','')::uuid  AS teacher_id
    FROM jsonb_array_elements(p_assignments) AS a
  ),
  diff AS (
    SELECT COALESCE(o.cs_id, n.cs_id) AS cs_id, o.teacher_id AS old_tid, n.teacher_id AS new_tid
    FROM old_state o
    FULL OUTER JOIN new_state n ON o.cs_id = n.cs_id
    WHERE o.teacher_id IS DISTINCT FROM n.teacher_id
  )
  SELECT jsonb_agg(jsonb_build_object(
           'subject',     subj.name,
           'old_teacher', NULLIF(TRIM(COALESCE(oldu.first_name,'') || ' ' || COALESCE(oldu.last_name,'')), ''),
           'new_teacher', NULLIF(TRIM(COALESCE(newu.first_name,'') || ' ' || COALESCE(newu.last_name,'')), '')
         ) ORDER BY subj.name)
  INTO v_changes
  FROM diff d
  JOIN public.curriculum_subjects cs ON cs.curriculum_subject_id = d.cs_id
  JOIN public.subjects subj          ON subj.subject_id = cs.subject_id
  LEFT JOIN public.users oldu        ON oldu.uid = d.old_tid
  LEFT JOIN public.users newu        ON newu.uid = d.new_tid;

  -- Original logic: replace all active assignments for the section.
  UPDATE public.teacher_class_assignments
  SET    deleted_at = NOW()
  WHERE  section_id  = p_section_id
    AND  deleted_at IS NULL;

  INSERT INTO public.teacher_class_assignments (section_id, curriculum_subject_id, teacher_id)
  SELECT
    p_section_id,
    (a->>'curriculum_subject_id')::integer,
    (a->>'teacher_id')::uuid
  FROM   jsonb_array_elements(p_assignments) AS a
  WHERE  (a->>'teacher_id') IS NOT NULL
    AND  (a->>'teacher_id') <> '';

  RETURN jsonb_build_object(
    '_audit', jsonb_build_object(
      'label',   v_section_name,
      'changes', COALESCE(v_changes, '[]'::jsonb)
    )
  );
END;
$function$;
