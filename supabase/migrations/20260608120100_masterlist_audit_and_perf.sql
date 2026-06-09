-- Masterlist save — audit diff + minimal permission-sync set + perf.
--
-- This PROMOTES the proven side-by-side _v2 implementation to the canonical
-- name save_teaching_load_masterlist. The original v1 returned void; the new
-- definition returns jsonb (audit envelope + operational uid sets), which is a
-- return-type change, so the old signatures are dropped first.
--
-- Safe to paste-and-run on the shared prod DB: the DROP+CREATE is atomic, and
-- any still-deployed caller of save_teaching_load_masterlist only reads `error`
-- (it ignores the returned jsonb), so it keeps working after promotion.
--
-- vs the original v1: all logic preserved (active-SY lookup, stale-data guard,
-- affected-uid collection, adviser/assignment apply, Faculty-role reconciliation).
-- ADDED, all in-transaction (zero extra reads): human-readable old->new diff
-- (names, not ids), the MINIMAL permission-sync set (uids whose Faculty role
-- flipped), and the BROAD context-invalidation set (every touched uid).
--
-- Schema assumptions (match prior code): curriculum_subjects.subject_id FK to
-- subjects.subject_id; school_years.start_year/end_year exist.

-- Drop the original void v1 (return-type change) and the transient _v2 stepping stone.
DROP FUNCTION IF EXISTS public.save_teaching_load_masterlist(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.save_teaching_load_masterlist_v2(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.save_teaching_load_masterlist(
  p_advisers    jsonb,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_sy_id       int;
  v_adviser_changes    jsonb;
  v_assignment_changes jsonb;
  v_added              uuid[];
  v_removed            uuid[];
  v_perm_uids          uuid[];
  v_ctx_uids           uuid[];
BEGIN
  -- ── Active school year ─────────────────────────────────────────────────────
  SELECT sy_id INTO v_active_sy_id
  FROM public.school_years
  WHERE is_active = true AND deleted_at IS NULL
  LIMIT 1;

  IF v_active_sy_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SCHOOL_YEAR';
  END IF;

  -- Section IDs in payload must belong to the active SY (stale-data guard).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_advisers) AS entry
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sections s
      WHERE s.section_id = (entry->>'section_id')::int
        AND s.sy_id = v_active_sy_id
        AND s.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'STALE_DATA';
  END IF;

  -- ── Collect affected UIDs (broad set, for assignment-context cache) ────────
  CREATE TEMP TABLE _affected_uids (uid uuid) ON COMMIT DROP;

  INSERT INTO _affected_uids                                  -- old advisers displaced
  SELECT DISTINCT s.adviser_id
  FROM jsonb_array_elements(p_advisers) AS entry
  JOIN public.sections s ON s.section_id = (entry->>'section_id')::int
  WHERE s.adviser_id IS NOT NULL AND s.deleted_at IS NULL;

  INSERT INTO _affected_uids                                  -- new advisers assigned
  SELECT DISTINCT (entry->>'adviser_id')::uuid
  FROM jsonb_array_elements(p_advisers) AS entry
  WHERE entry->>'adviser_id' IS NOT NULL;

  INSERT INTO _affected_uids                                  -- old teachers displaced
  SELECT DISTINCT tca.teacher_id
  FROM jsonb_array_elements(p_assignments) AS entry
  JOIN public.teacher_class_assignments tca
    ON  tca.section_id            = (entry->>'section_id')::int
    AND tca.curriculum_subject_id = (entry->>'curriculum_subject_id')::int
    AND tca.deleted_at IS NULL;

  INSERT INTO _affected_uids                                  -- new teachers assigned
  SELECT DISTINCT (entry->>'teacher_id')::uuid
  FROM jsonb_array_elements(p_assignments) AS entry
  WHERE entry->>'teacher_id' IS NOT NULL;

  -- ── Build human-readable diff BEFORE applying changes (names, not ids) ──────
  -- Adviser cells that actually change.
  SELECT jsonb_agg(jsonb_build_object(
           'type',    'adviser',
           'section', s.name,
           'old',     NULLIF(TRIM(COALESCE(oldu.first_name,'') || ' ' || COALESCE(oldu.last_name,'')), ''),
           'new',     NULLIF(TRIM(COALESCE(newu.first_name,'') || ' ' || COALESCE(newu.last_name,'')), '')
         ) ORDER BY s.name)
  INTO v_adviser_changes
  FROM jsonb_array_elements(p_advisers) AS entry
  JOIN public.sections s
    ON s.section_id = (entry->>'section_id')::int AND s.deleted_at IS NULL
  LEFT JOIN public.users oldu ON oldu.uid = s.adviser_id
  LEFT JOIN public.users newu ON newu.uid = (entry->>'adviser_id')::uuid
  WHERE s.adviser_id IS DISTINCT FROM (entry->>'adviser_id')::uuid;

  -- Assignment cells that actually change.
  SELECT jsonb_agg(jsonb_build_object(
           'type',    'assignment',
           'section', s.name,
           'subject', subj.name,
           'old',     NULLIF(TRIM(COALESCE(oldu.first_name,'') || ' ' || COALESCE(oldu.last_name,'')), ''),
           'new',     NULLIF(TRIM(COALESCE(newu.first_name,'') || ' ' || COALESCE(newu.last_name,'')), '')
         ) ORDER BY s.name, subj.name)
  INTO v_assignment_changes
  FROM jsonb_array_elements(p_assignments) AS entry
  JOIN public.sections s
    ON s.section_id = (entry->>'section_id')::int AND s.deleted_at IS NULL
  JOIN public.curriculum_subjects cs
    ON cs.curriculum_subject_id = (entry->>'curriculum_subject_id')::int
  JOIN public.subjects subj
    ON subj.subject_id = cs.subject_id
  LEFT JOIN public.teacher_class_assignments tca
    ON  tca.section_id            = (entry->>'section_id')::int
    AND tca.curriculum_subject_id = (entry->>'curriculum_subject_id')::int
    AND tca.deleted_at IS NULL
  LEFT JOIN public.users oldu ON oldu.uid = tca.teacher_id
  LEFT JOIN public.users newu ON newu.uid = (entry->>'teacher_id')::uuid
  WHERE tca.teacher_id IS DISTINCT FROM (entry->>'teacher_id')::uuid;

  -- ── Apply adviser changes ──────────────────────────────────────────────────
  UPDATE public.sections
  SET adviser_id = (entry->>'adviser_id')::uuid
  FROM jsonb_array_elements(p_advisers) AS entry
  WHERE sections.section_id = (entry->>'section_id')::int
    AND sections.deleted_at IS NULL;

  -- ── Apply teaching assignment changes ──────────────────────────────────────
  -- Soft-delete the active row when the teacher changes or the cell is cleared.
  UPDATE public.teacher_class_assignments
  SET deleted_at = NOW()
  FROM jsonb_array_elements(p_assignments) AS entry
  WHERE teacher_class_assignments.section_id            = (entry->>'section_id')::int
    AND teacher_class_assignments.curriculum_subject_id = (entry->>'curriculum_subject_id')::int
    AND teacher_class_assignments.deleted_at IS NULL
    AND (
      entry->>'teacher_id' IS NULL
      OR teacher_class_assignments.teacher_id <> (entry->>'teacher_id')::uuid
    );

  -- Insert a fresh active record where the teacher isn't already active.
  INSERT INTO public.teacher_class_assignments (teacher_id, section_id, curriculum_subject_id)
  SELECT DISTINCT ON ((entry->>'section_id')::int, (entry->>'curriculum_subject_id')::int)
    (entry->>'teacher_id')::uuid,
    (entry->>'section_id')::int,
    (entry->>'curriculum_subject_id')::int
  FROM jsonb_array_elements(p_assignments) AS entry
  WHERE entry->>'teacher_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_class_assignments tca
      WHERE tca.section_id            = (entry->>'section_id')::int
        AND tca.curriculum_subject_id = (entry->>'curriculum_subject_id')::int
        AND tca.teacher_id            = (entry->>'teacher_id')::uuid
        AND tca.deleted_at IS NULL
    );

  -- ── Reconcile Faculty role, capturing the uids that actually flipped ───────
  WITH added AS (
    INSERT INTO public.user_roles (uid, role_id)
    SELECT DISTINCT a.uid, r.role_id
    FROM _affected_uids a
    CROSS JOIN public.roles r
    WHERE lower(trim(r.name)) = 'faculty'
      AND (
        EXISTS (SELECT 1 FROM public.sections s
                WHERE s.adviser_id = a.uid AND s.sy_id = v_active_sy_id AND s.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM public.teacher_class_assignments tca
                   JOIN public.sections s ON s.section_id = tca.section_id
                   WHERE tca.teacher_id = a.uid AND tca.deleted_at IS NULL
                     AND s.sy_id = v_active_sy_id AND s.deleted_at IS NULL)
      )
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.uid = a.uid AND ur.role_id = r.role_id)
    RETURNING uid
  )
  SELECT array_agg(DISTINCT uid) INTO v_added FROM added;

  WITH removed AS (
    DELETE FROM public.user_roles ur
    USING _affected_uids a, public.roles r
    WHERE ur.uid = a.uid
      AND ur.role_id = r.role_id
      AND lower(trim(r.name)) = 'faculty'
      AND NOT EXISTS (SELECT 1 FROM public.sections s
                      WHERE s.adviser_id = a.uid AND s.sy_id = v_active_sy_id AND s.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.teacher_class_assignments tca
                      JOIN public.sections s ON s.section_id = tca.section_id
                      WHERE tca.teacher_id = a.uid AND tca.deleted_at IS NULL
                        AND s.sy_id = v_active_sy_id AND s.deleted_at IS NULL)
    RETURNING ur.uid
  )
  SELECT array_agg(DISTINCT uid) INTO v_removed FROM removed;

  -- Minimal permission-sync set = faculty role added ∪ removed.
  SELECT array_agg(DISTINCT u)
  INTO v_perm_uids
  FROM unnest(COALESCE(v_added, '{}'::uuid[]) || COALESCE(v_removed, '{}'::uuid[])) AS u
  WHERE u IS NOT NULL;

  -- Broad context-invalidation set = everyone touched.
  SELECT array_agg(DISTINCT uid) INTO v_ctx_uids
  FROM _affected_uids WHERE uid IS NOT NULL;

  -- ── Return operational uid sets + audit envelope ───────────────────────────
  RETURN jsonb_build_object(
    'permission_changed_uids', to_jsonb(COALESCE(v_perm_uids, '{}'::uuid[])),
    'context_changed_uids',    to_jsonb(COALESCE(v_ctx_uids,  '{}'::uuid[])),
    '_audit', jsonb_build_object(
      'label', (SELECT start_year::text || '–' || end_year::text
                FROM public.school_years WHERE sy_id = v_active_sy_id),
      'new', jsonb_build_object(
        'adviser_changes',    COALESCE(jsonb_array_length(v_adviser_changes), 0),
        'assignment_changes', COALESCE(jsonb_array_length(v_assignment_changes), 0)
      ),
      -- Per-change diff under metadata so auditFromRpc persists it as
      -- metadata.changes (summary counts stay in new_values).
      'metadata', jsonb_build_object(
        'changes', COALESCE(v_adviser_changes, '[]'::jsonb) || COALESCE(v_assignment_changes, '[]'::jsonb)
      )
    )
  );
END;
$function$;
