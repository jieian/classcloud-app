CREATE OR REPLACE FUNCTION public.assign_faculty_academic_load(
  p_faculty_id uuid,
  p_advisory_section_id integer DEFAULT NULL::integer,
  p_subject_assignments jsonb DEFAULT '[]'::jsonb,
  p_manage_coordinator boolean DEFAULT false,
  p_subject_group_id integer DEFAULT NULL::integer,
  p_manage_gsl boolean DEFAULT false,
  p_gsl_curriculum_subject_id integer DEFAULT NULL::integer,
  p_gsl_grade_level_id integer DEFAULT NULL::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active_sy_id integer;
  v_gsl_role_id integer;
BEGIN
  SELECT sy.sy_id
    INTO v_active_sy_id
  FROM public.school_years sy
  WHERE sy.is_active = true
    AND sy.deleted_at IS NULL
  LIMIT 1;

  IF v_active_sy_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_SCHOOL_YEAR';
  END IF;

  UPDATE public.sections AS s
  SET adviser_id = NULL
  WHERE s.adviser_id = p_faculty_id
    AND s.sy_id = v_active_sy_id
    AND s.deleted_at IS NULL;

  IF p_advisory_section_id IS NOT NULL THEN
    UPDATE public.sections AS s
    SET adviser_id = p_faculty_id
    WHERE s.section_id = p_advisory_section_id
      AND s.sy_id = v_active_sy_id
      AND s.deleted_at IS NULL;
  END IF;

  UPDATE public.teacher_class_assignments AS tca
  SET deleted_at = NOW()
  WHERE tca.teacher_id = p_faculty_id
    AND tca.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.sections AS s
      WHERE s.section_id = tca.section_id
        AND s.sy_id = v_active_sy_id
        AND s.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_subject_assignments) AS sa
      WHERE (sa->>'section_id')::integer = tca.section_id
        AND (sa->>'curriculum_subject_id')::integer = tca.curriculum_subject_id
    );

  WITH incoming AS (
    SELECT DISTINCT
      (sa->>'section_id')::integer AS section_id,
      (sa->>'curriculum_subject_id')::integer AS curriculum_subject_id
    FROM jsonb_array_elements(p_subject_assignments) AS sa
  ),
  revive_ids AS (
    SELECT DISTINCT ON (i.section_id, i.curriculum_subject_id)
      tca.id
    FROM incoming AS i
    JOIN public.sections AS s
      ON s.section_id = i.section_id
     AND s.sy_id = v_active_sy_id
     AND s.deleted_at IS NULL
    JOIN public.teacher_class_assignments AS tca
      ON tca.teacher_id = p_faculty_id
     AND tca.section_id = i.section_id
     AND tca.curriculum_subject_id = i.curriculum_subject_id
     AND tca.deleted_at IS NOT NULL
    ORDER BY i.section_id, i.curriculum_subject_id, tca.id DESC
  )
  UPDATE public.teacher_class_assignments AS tca
  SET deleted_at = NULL
  FROM revive_ids AS r
  WHERE tca.id = r.id;

  WITH incoming AS (
    SELECT DISTINCT
      (sa->>'section_id')::integer AS section_id,
      (sa->>'curriculum_subject_id')::integer AS curriculum_subject_id
    FROM jsonb_array_elements(p_subject_assignments) AS sa
  )
  INSERT INTO public.teacher_class_assignments (
    teacher_id,
    section_id,
    curriculum_subject_id
  )
  SELECT
    p_faculty_id,
    i.section_id,
    i.curriculum_subject_id
  FROM incoming AS i
  JOIN public.sections AS s
    ON s.section_id = i.section_id
   AND s.sy_id = v_active_sy_id
   AND s.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.teacher_class_assignments AS tca
    WHERE tca.teacher_id = p_faculty_id
      AND tca.section_id = i.section_id
      AND tca.curriculum_subject_id = i.curriculum_subject_id
  );

  INSERT INTO public.user_roles (uid, role_id)
  SELECT p_faculty_id, r.role_id
  FROM public.roles AS r
  WHERE lower(trim(r.name)) = 'faculty'
  ON CONFLICT DO NOTHING;

  IF p_manage_coordinator THEN
    UPDATE public.subject_coordinators AS sc
    SET deleted_at = NOW()
    WHERE sc.user_id = p_faculty_id
      AND sc.sy_id = v_active_sy_id
      AND sc.deleted_at IS NULL;

    IF p_subject_group_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.subject_coordinators AS sc
        WHERE sc.subject_group_id = p_subject_group_id
          AND sc.sy_id = v_active_sy_id
          AND sc.deleted_at IS NULL
          AND sc.user_id <> p_faculty_id
      ) THEN
        RAISE EXCEPTION 'Subject group already has a coordinator.';
      END IF;

      WITH revived AS (
        UPDATE public.subject_coordinators AS sc
        SET deleted_at = NULL,
            assigned_at = NOW()
        WHERE sc.sc_id = (
          SELECT sc2.sc_id
          FROM public.subject_coordinators AS sc2
          WHERE sc2.user_id = p_faculty_id
            AND sc2.subject_group_id = p_subject_group_id
            AND sc2.sy_id = v_active_sy_id
          ORDER BY sc2.assigned_at DESC NULLS LAST, sc2.sc_id DESC
          LIMIT 1
        )
        RETURNING sc.sc_id
      )
      INSERT INTO public.subject_coordinators (
        user_id,
        subject_group_id,
        sy_id,
        assigned_at
      )
      SELECT p_faculty_id, p_subject_group_id, v_active_sy_id, NOW()
      WHERE NOT EXISTS (SELECT 1 FROM revived);

      INSERT INTO public.user_roles (uid, role_id)
      SELECT p_faculty_id, r.role_id
      FROM public.roles AS r
      WHERE lower(trim(r.name)) = 'subject coordinator'
      ON CONFLICT DO NOTHING;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.subject_coordinators AS sc
      WHERE sc.user_id = p_faculty_id
        AND sc.sy_id = v_active_sy_id
        AND sc.deleted_at IS NULL
    ) THEN
      DELETE FROM public.user_roles AS ur
      USING public.roles AS r
      WHERE ur.uid = p_faculty_id
        AND ur.role_id = r.role_id
        AND lower(trim(r.name)) = 'subject coordinator';
    END IF;
  END IF;

  IF p_manage_gsl THEN
    SELECT r.role_id
      INTO v_gsl_role_id
    FROM public.roles AS r
    WHERE lower(trim(r.name)) = 'grade subject leader'
    LIMIT 1;

    UPDATE public.grade_subject_leaders AS gsl
    SET deleted_at = NOW()
    WHERE gsl.user_id = p_faculty_id
      AND gsl.sy_id = v_active_sy_id
      AND gsl.deleted_at IS NULL;

    IF p_gsl_curriculum_subject_id IS NOT NULL
       AND p_gsl_grade_level_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.grade_subject_leaders AS gsl
        WHERE gsl.curriculum_subject_id = p_gsl_curriculum_subject_id
          AND gsl.grade_level_id = p_gsl_grade_level_id
          AND gsl.sy_id = v_active_sy_id
          AND gsl.deleted_at IS NULL
          AND gsl.user_id <> p_faculty_id
      ) THEN
        RAISE EXCEPTION 'GSL_SLOT_TAKEN';
      END IF;

      WITH revived AS (
        UPDATE public.grade_subject_leaders AS gsl
        SET deleted_at = NULL,
            assigned_at = NOW()
        WHERE gsl.gsl_id = (
          SELECT gsl2.gsl_id
          FROM public.grade_subject_leaders AS gsl2
          WHERE gsl2.user_id = p_faculty_id
            AND gsl2.curriculum_subject_id = p_gsl_curriculum_subject_id
            AND gsl2.grade_level_id = p_gsl_grade_level_id
            AND gsl2.sy_id = v_active_sy_id
          ORDER BY gsl2.assigned_at DESC NULLS LAST, gsl2.gsl_id DESC
          LIMIT 1
        )
        RETURNING gsl.gsl_id
      )
      INSERT INTO public.grade_subject_leaders (
        user_id,
        curriculum_subject_id,
        grade_level_id,
        sy_id,
        assigned_at
      )
      SELECT
        p_faculty_id,
        p_gsl_curriculum_subject_id,
        p_gsl_grade_level_id,
        v_active_sy_id,
        NOW()
      WHERE NOT EXISTS (SELECT 1 FROM revived);

      INSERT INTO public.user_roles (uid, role_id)
      SELECT p_faculty_id, v_gsl_role_id
      WHERE v_gsl_role_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.grade_subject_leaders AS gsl
      WHERE gsl.user_id = p_faculty_id
        AND gsl.sy_id = v_active_sy_id
        AND gsl.deleted_at IS NULL
    ) THEN
      DELETE FROM public.user_roles AS ur
      WHERE ur.uid = p_faculty_id
        AND ur.role_id = v_gsl_role_id;
    END IF;
  END IF;
END;
$function$;
