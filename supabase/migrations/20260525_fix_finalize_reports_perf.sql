-- Fix timeout issues in finalize_exam_reports_atomic:
-- 1. Add index on scores for the DISTINCT ON query (was doing full sort without it)
-- 2. Add indexes on temporary tables used inside the loop
-- 3. Replace N correlated subqueries per exam item with a single CROSS JOIN aggregation

CREATE INDEX IF NOT EXISTS idx_scores_exam_assignment_enrollment
  ON public.scores (exam_assignment_id, enrollment_id, graded_at DESC);

CREATE OR REPLACE FUNCTION public.finalize_exam_reports_atomic(
  p_exam_id integer,
  p_generated_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_total_items integer;
  v_answer_key jsonb;
  v_assignment record;
  v_first_section_id integer;
  v_first_grade_level_id integer;
  v_required_count integer;
  v_scanned_count integer;
  v_missing_count integer;
  v_now timestamptz := now();
  v_total_cases integer;
  v_total_male_cases integer;
  v_total_female_cases integer;
  v_total_score integer;
  v_mean numeric;
  v_mps numeric;
  v_pl numeric;
  v_sd numeric;
  v_highest_score integer;
  v_lowest_score integer;
  v_total_enrolled_male integer;
  v_total_enrolled_female integer;
  v_total_enrolled integer;
  v_total_male_achieved integer;
  v_total_female_achieved integer;
  v_total_achieved integer;
  v_total_male_failed integer;
  v_total_female_failed integer;
  v_total_failed integer;
  v_total_male_highly integer;
  v_total_female_highly integer;
  v_total_male_proficient integer;
  v_total_female_proficient integer;
  v_total_male_nearly integer;
  v_total_female_nearly integer;
  v_total_male_low integer;
  v_total_female_low integer;
  v_total_male_not integer;
  v_total_female_not integer;
  v_student_scores jsonb;
  v_item_scores jsonb;
  v_most_learned jsonb;
  v_least_learned jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(86001, p_exam_id);

  SELECT *
    INTO v_exam
  FROM public.exams
  WHERE exam_id = p_exam_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXAM_NOT_FOUND';
  END IF;

  IF v_exam.curriculum_subject_id IS NULL OR v_exam.quarter_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_REPORT_CONTEXT';
  END IF;

  v_total_items := COALESCE(
    NULLIF(v_exam.answer_key->>'total_questions', '')::integer,
    v_exam.total_items,
    0
  );

  IF v_total_items <= 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL_ITEMS';
  END IF;

  v_answer_key := COALESCE(v_exam.answer_key->'answers', '{}'::jsonb);

  DROP TABLE IF EXISTS tmp_finalize_assignments;
  CREATE TEMP TABLE tmp_finalize_assignments ON COMMIT DROP AS
  SELECT
    ea.id AS assignment_id,
    ea.section_id,
    s.grade_level_id,
    s.sy_id,
    s.section_type
  FROM public.exam_assignments ea
  JOIN public.sections s ON s.section_id = ea.section_id
  WHERE ea.exam_id = p_exam_id;

  IF NOT EXISTS (SELECT 1 FROM tmp_finalize_assignments) THEN
    RAISE EXCEPTION 'NO_ASSIGNED_SECTION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_finalize_assignments
    WHERE grade_level_id IS NULL OR sy_id IS NULL OR section_type IS NULL
  ) THEN
    RAISE EXCEPTION 'MISSING_ASSIGNMENT_CONTEXT';
  END IF;

  SELECT section_id, grade_level_id
    INTO v_first_section_id, v_first_grade_level_id
  FROM tmp_finalize_assignments
  ORDER BY assignment_id
  LIMIT 1;

  DROP TABLE IF EXISTS tmp_finalize_enrollments;
  CREATE TEMP TABLE tmp_finalize_enrollments ON COMMIT DROP AS
  SELECT
    e.enrollment_id,
    e.section_id,
    COALESCE(NULLIF(trim(st.full_name), ''), 'Enrollment #' || e.enrollment_id::text) AS student_name,
    CASE
      WHEN lower(COALESCE(st.sex, '')) = 'f'
        OR lower(COALESCE(st.sex, '')) = 'female'
        OR lower(COALESCE(st.sex, '')) LIKE 'female%'
      THEN 'Female'
      ELSE 'Male'
    END AS sex
  FROM public.enrollments e
  LEFT JOIN public.students st ON st.lrn = e.lrn
  JOIN tmp_finalize_assignments a ON a.section_id = e.section_id
  WHERE e.deleted_at IS NULL;

  IF NOT EXISTS (SELECT 1 FROM tmp_finalize_enrollments) THEN
    RETURN jsonb_build_object('error', 'NO_STUDENTS');
  END IF;

  DROP TABLE IF EXISTS tmp_finalize_scores;
  CREATE TEMP TABLE tmp_finalize_scores ON COMMIT DROP AS
  SELECT DISTINCT ON (s.enrollment_id, s.exam_assignment_id)
    s.score_id,
    s.enrollment_id,
    s.exam_assignment_id,
    COALESCE(s.responses, '{}'::jsonb) AS responses,
    s.calculated_score,
    s.graded_at
  FROM public.scores s
  JOIN tmp_finalize_assignments a ON a.assignment_id = s.exam_assignment_id
  ORDER BY s.enrollment_id, s.exam_assignment_id, s.graded_at DESC, s.score_id DESC;

  -- Index speeds up the per-assignment JOINs inside the loop below
  CREATE INDEX ON tmp_finalize_scores (enrollment_id, exam_assignment_id);

  SELECT COUNT(*)
    INTO v_required_count
  FROM tmp_finalize_enrollments e
  JOIN tmp_finalize_assignments a ON a.section_id = e.section_id;

  IF v_required_count = 0 THEN
    RETURN jsonb_build_object('error', 'NO_VALID_STUDENT_ASSIGNMENT_PAIRS');
  END IF;

  SELECT COUNT(*)
    INTO v_scanned_count
  FROM tmp_finalize_enrollments e
  JOIN tmp_finalize_assignments a ON a.section_id = e.section_id
  JOIN tmp_finalize_scores s
    ON s.enrollment_id = e.enrollment_id
   AND s.exam_assignment_id = a.assignment_id;

  v_missing_count := v_required_count - v_scanned_count;
  IF v_missing_count > 0 THEN
    RETURN jsonb_build_object(
      'error', 'MISSING_SCANNED_RESULTS',
      'missingCount', v_missing_count,
      'requiredCount', v_required_count,
      'scannedCount', v_scanned_count
    );
  END IF;

  FOR v_assignment IN SELECT * FROM tmp_finalize_assignments LOOP
    DROP TABLE IF EXISTS tmp_report_students;
    CREATE TEMP TABLE tmp_report_students ON COMMIT DROP AS
    SELECT
      e.enrollment_id,
      e.student_name,
      e.sex,
      s.score_id,
      COALESCE(s.calculated_score, 0) AS score,
      v_total_items AS total_items,
      ROUND((COALESCE(s.calculated_score, 0)::numeric / v_total_items) * 100, 2) AS mpl,
      CASE
        WHEN ROUND((COALESCE(s.calculated_score, 0)::numeric / v_total_items) * 100, 2) >= 90 THEN 'Highly Proficient'
        WHEN ROUND((COALESCE(s.calculated_score, 0)::numeric / v_total_items) * 100, 2) >= 75 THEN 'Proficient'
        WHEN ROUND((COALESCE(s.calculated_score, 0)::numeric / v_total_items) * 100, 2) >= 50 THEN 'Nearly Proficient'
        WHEN ROUND((COALESCE(s.calculated_score, 0)::numeric / v_total_items) * 100, 2) >= 25 THEN 'Low Proficient'
        ELSE 'Not Proficient'
      END AS proficiency_level,
      s.graded_at,
      s.responses
    FROM tmp_finalize_enrollments e
    JOIN tmp_finalize_scores s
      ON s.enrollment_id = e.enrollment_id
     AND s.exam_assignment_id = v_assignment.assignment_id
    WHERE e.section_id = v_assignment.section_id;

    -- Index needed for item analysis CROSS JOIN aggregation below
    CREATE INDEX ON tmp_report_students (enrollment_id);

    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE sex = 'Male'),
      COUNT(*) FILTER (WHERE sex = 'Female'),
      COALESCE(SUM(score), 0),
      COALESCE(ROUND(AVG(score)::numeric, 2), 0),
      COALESCE(ROUND((AVG(score)::numeric / v_total_items), 2), 0),
      COALESCE(ROUND((AVG(score)::numeric / v_total_items) * 100, 2), 0),
      COALESCE(ROUND(stddev_pop(score)::numeric, 2), 0),
      COALESCE(MAX(score), 0),
      COALESCE(MIN(score), 0),
      COUNT(*) FILTER (WHERE sex = 'Male' AND mpl >= 60),
      COUNT(*) FILTER (WHERE sex = 'Female' AND mpl >= 60),
      COUNT(*) FILTER (WHERE mpl >= 60),
      COUNT(*) FILTER (WHERE sex = 'Male' AND mpl < 60),
      COUNT(*) FILTER (WHERE sex = 'Female' AND mpl < 60),
      COUNT(*) FILTER (WHERE mpl < 60),
      COUNT(*) FILTER (WHERE sex = 'Male' AND proficiency_level = 'Highly Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Female' AND proficiency_level = 'Highly Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Male' AND proficiency_level = 'Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Female' AND proficiency_level = 'Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Male' AND proficiency_level = 'Nearly Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Female' AND proficiency_level = 'Nearly Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Male' AND proficiency_level = 'Low Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Female' AND proficiency_level = 'Low Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Male' AND proficiency_level = 'Not Proficient'),
      COUNT(*) FILTER (WHERE sex = 'Female' AND proficiency_level = 'Not Proficient')
    INTO
      v_total_cases,
      v_total_male_cases,
      v_total_female_cases,
      v_total_score,
      v_mean,
      v_mps,
      v_pl,
      v_sd,
      v_highest_score,
      v_lowest_score,
      v_total_male_achieved,
      v_total_female_achieved,
      v_total_achieved,
      v_total_male_failed,
      v_total_female_failed,
      v_total_failed,
      v_total_male_highly,
      v_total_female_highly,
      v_total_male_proficient,
      v_total_female_proficient,
      v_total_male_nearly,
      v_total_female_nearly,
      v_total_male_low,
      v_total_female_low,
      v_total_male_not,
      v_total_female_not
    FROM tmp_report_students;

    SELECT
      COUNT(*) FILTER (WHERE sex = 'Male'),
      COUNT(*) FILTER (WHERE sex = 'Female')
    INTO v_total_enrolled_male, v_total_enrolled_female
    FROM tmp_finalize_enrollments
    WHERE section_id = v_assignment.section_id;

    v_total_enrolled := v_total_enrolled_male + v_total_enrolled_female;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'enrollment_id', enrollment_id,
        'student_name', student_name,
        'sex', sex,
        'score_id', score_id,
        'score', score,
        'total_items', total_items,
        'mpl', mpl,
        'proficiency_level', proficiency_level,
        'graded_at', graded_at
      )
      ORDER BY student_name
    ), '[]'::jsonb)
    INTO v_student_scores
    FROM tmp_report_students;

    INSERT INTO public.exam_results_reports (
      exam_id,
      section_id,
      teacher_id,
      sy_id,
      curriculum_subject_id,
      grade_level_id,
      quarter_id,
      section_type,
      total_items,
      total_cases,
      total_male_cases,
      total_female_cases,
      total_score,
      mean,
      mps,
      pl,
      sd,
      highest_score,
      lowest_score,
      mpl_threshold,
      total_male_achieved,
      total_female_achieved,
      total_achieved,
      male_achieved_percent,
      female_achieved_percent,
      total_achieved_percent,
      total_male_failed,
      total_female_failed,
      total_failed,
      male_failed_percent,
      female_failed_percent,
      total_failed_percent,
      total_male_highly,
      total_male_proficient,
      total_male_nearly,
      total_male_low,
      total_male_not,
      total_female_highly,
      total_female_proficient,
      total_female_nearly,
      total_female_low,
      total_female_not,
      percent_highly,
      percent_proficient,
      percent_nearly,
      percent_low,
      percent_not,
      student_scores,
      total_enrolled_male,
      total_enrolled_female,
      male_percentage,
      female_percentage,
      total_percentage,
      generated_at,
      generated_by
    )
    VALUES (
      p_exam_id,
      v_assignment.section_id,
      COALESCE(
        v_exam.creator_teacher_id,
        (
          SELECT tca.teacher_id
          FROM public.teacher_class_assignments tca
          WHERE tca.section_id = v_assignment.section_id
            AND tca.curriculum_subject_id = v_exam.curriculum_subject_id
            AND tca.deleted_at IS NULL
            AND tca.teacher_id IS NOT NULL
          ORDER BY tca.id
          LIMIT 1
        )
      ),
      v_assignment.sy_id,
      v_exam.curriculum_subject_id,
      v_assignment.grade_level_id,
      v_exam.quarter_id,
      v_assignment.section_type,
      v_total_items,
      v_total_cases,
      v_total_male_cases,
      v_total_female_cases,
      v_total_score,
      v_mean,
      v_mps,
      v_pl,
      v_sd,
      v_highest_score,
      v_lowest_score,
      60,
      v_total_male_achieved,
      v_total_female_achieved,
      v_total_achieved,
      COALESCE(ROUND((v_total_male_achieved::numeric / NULLIF(v_total_male_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_female_achieved::numeric / NULLIF(v_total_female_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_achieved::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      v_total_male_failed,
      v_total_female_failed,
      v_total_failed,
      COALESCE(ROUND((v_total_male_failed::numeric / NULLIF(v_total_male_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_female_failed::numeric / NULLIF(v_total_female_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_failed::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      v_total_male_highly,
      v_total_male_proficient,
      v_total_male_nearly,
      v_total_male_low,
      v_total_male_not,
      v_total_female_highly,
      v_total_female_proficient,
      v_total_female_nearly,
      v_total_female_low,
      v_total_female_not,
      COALESCE(ROUND(((v_total_male_highly + v_total_female_highly)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND(((v_total_male_proficient + v_total_female_proficient)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND(((v_total_male_nearly + v_total_female_nearly)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND(((v_total_male_low + v_total_female_low)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      COALESCE(ROUND(((v_total_male_not + v_total_female_not)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0),
      v_student_scores,
      v_total_enrolled_male,
      v_total_enrolled_female,
      COALESCE(ROUND((v_total_male_cases::numeric / NULLIF(v_total_enrolled_male, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_female_cases::numeric / NULLIF(v_total_enrolled_female, 0)) * 100, 2), 0),
      COALESCE(ROUND((v_total_cases::numeric / NULLIF(v_total_enrolled, 0)) * 100, 2), 0),
      v_now,
      p_generated_by
    )
    ON CONFLICT (exam_id, section_id) DO UPDATE SET
      teacher_id = EXCLUDED.teacher_id,
      sy_id = EXCLUDED.sy_id,
      curriculum_subject_id = EXCLUDED.curriculum_subject_id,
      grade_level_id = EXCLUDED.grade_level_id,
      quarter_id = EXCLUDED.quarter_id,
      section_type = EXCLUDED.section_type,
      total_items = EXCLUDED.total_items,
      total_cases = EXCLUDED.total_cases,
      total_male_cases = EXCLUDED.total_male_cases,
      total_female_cases = EXCLUDED.total_female_cases,
      total_score = EXCLUDED.total_score,
      mean = EXCLUDED.mean,
      mps = EXCLUDED.mps,
      pl = EXCLUDED.pl,
      sd = EXCLUDED.sd,
      highest_score = EXCLUDED.highest_score,
      lowest_score = EXCLUDED.lowest_score,
      mpl_threshold = EXCLUDED.mpl_threshold,
      total_male_achieved = EXCLUDED.total_male_achieved,
      total_female_achieved = EXCLUDED.total_female_achieved,
      total_achieved = EXCLUDED.total_achieved,
      male_achieved_percent = EXCLUDED.male_achieved_percent,
      female_achieved_percent = EXCLUDED.female_achieved_percent,
      total_achieved_percent = EXCLUDED.total_achieved_percent,
      total_male_failed = EXCLUDED.total_male_failed,
      total_female_failed = EXCLUDED.total_female_failed,
      total_failed = EXCLUDED.total_failed,
      male_failed_percent = EXCLUDED.male_failed_percent,
      female_failed_percent = EXCLUDED.female_failed_percent,
      total_failed_percent = EXCLUDED.total_failed_percent,
      total_male_highly = EXCLUDED.total_male_highly,
      total_male_proficient = EXCLUDED.total_male_proficient,
      total_male_nearly = EXCLUDED.total_male_nearly,
      total_male_low = EXCLUDED.total_male_low,
      total_male_not = EXCLUDED.total_male_not,
      total_female_highly = EXCLUDED.total_female_highly,
      total_female_proficient = EXCLUDED.total_female_proficient,
      total_female_nearly = EXCLUDED.total_female_nearly,
      total_female_low = EXCLUDED.total_female_low,
      total_female_not = EXCLUDED.total_female_not,
      percent_highly = EXCLUDED.percent_highly,
      percent_proficient = EXCLUDED.percent_proficient,
      percent_nearly = EXCLUDED.percent_nearly,
      percent_low = EXCLUDED.percent_low,
      percent_not = EXCLUDED.percent_not,
      student_scores = EXCLUDED.student_scores,
      total_enrolled_male = EXCLUDED.total_enrolled_male,
      total_enrolled_female = EXCLUDED.total_enrolled_female,
      male_percentage = EXCLUDED.male_percentage,
      female_percentage = EXCLUDED.female_percentage,
      total_percentage = EXCLUDED.total_percentage,
      generated_at = EXCLUDED.generated_at,
      generated_by = EXCLUDED.generated_by;

    -- Item analysis: one CROSS JOIN pass replaces 2*v_total_items correlated subqueries.
    -- v_total_cases already holds COUNT(*) FROM tmp_report_students so no subquery needed
    -- for correct_percent either.
    DROP TABLE IF EXISTS tmp_item_analysis;
    CREATE TEMP TABLE tmp_item_analysis ON COMMIT DROP AS
    WITH response_agg AS (
      SELECT
        gs.item_no,
        COUNT(*) FILTER (
          WHERE v_answer_key->>gs.item_no::text IS NOT NULL
            AND rs.responses->>gs.item_no::text = v_answer_key->>gs.item_no::text
        ) AS correct_responses,
        COUNT(*) FILTER (
          WHERE NULLIF(rs.responses->>gs.item_no::text, '') IS NOT NULL
        ) AS total_responses
      FROM generate_series(1, v_total_items) gs(item_no)
      CROSS JOIN tmp_report_students rs
      GROUP BY gs.item_no
    )
    SELECT
      gs.item_no,
      COALESCE(
        (
          SELECT NULLIF(trim(obj->>'objective'), '')
          FROM jsonb_array_elements(COALESCE(v_exam.objectives, '[]'::jsonb)) obj
          WHERE gs.item_no BETWEEN COALESCE(NULLIF(obj->>'start_item', '')::integer, -1)
                                AND COALESCE(NULLIF(obj->>'end_item', '')::integer, -1)
          LIMIT 1
        ),
        '-'
      ) AS objective,
      COALESCE(ra.correct_responses, 0) AS correct_responses,
      COALESCE(ra.total_responses, 0) AS total_responses,
      COALESCE(ROUND((COALESCE(ra.correct_responses, 0)::numeric / NULLIF(v_total_cases, 0)) * 100, 2), 0) AS correct_percent,
      row_number() OVER (ORDER BY COALESCE(ra.correct_responses, 0) DESC, gs.item_no ASC) AS rank
    FROM generate_series(1, v_total_items) gs(item_no)
    LEFT JOIN response_agg ra ON ra.item_no = gs.item_no;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_no', item_no,
        'objective', objective,
        'correct_responses', correct_responses,
        'total_responses', total_responses,
        'correct_percent', correct_percent,
        'rank', rank
      )
      ORDER BY item_no
    ), '[]'::jsonb)
    INTO v_item_scores
    FROM tmp_item_analysis;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_no', item_no,
        'objective', objective,
        'correct_responses', correct_responses,
        'total_responses', total_responses,
        'correct_percent', correct_percent,
        'rank', rank
      )
      ORDER BY rank
    ), '[]'::jsonb)
    INTO v_most_learned
    FROM (
      SELECT *
      FROM tmp_item_analysis
      ORDER BY correct_responses DESC, item_no ASC
      LIMIT 5
    ) most_rows;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_no', item_no,
        'objective', objective,
        'correct_responses', correct_responses,
        'total_responses', total_responses,
        'correct_percent', correct_percent,
        'rank', least_rank
      )
      ORDER BY least_rank
    ), '[]'::jsonb)
    INTO v_least_learned
    FROM (
      SELECT *,
             row_number() OVER (ORDER BY correct_responses ASC, item_no ASC) AS least_rank
      FROM tmp_item_analysis
      ORDER BY correct_responses ASC, item_no ASC
      LIMIT 5
    ) least_rows;

    INSERT INTO public.item_analysis_reports (
      exam_id,
      section_id,
      teacher_id,
      sy_id,
      curriculum_subject_id,
      grade_level_id,
      quarter_id,
      section_type,
      mpl_threshold,
      item_scores,
      most_learned,
      least_learned,
      generated_at,
      generated_by
    )
    VALUES (
      p_exam_id,
      v_assignment.section_id,
      COALESCE(
        v_exam.creator_teacher_id,
        (
          SELECT tca.teacher_id
          FROM public.teacher_class_assignments tca
          WHERE tca.section_id = v_assignment.section_id
            AND tca.curriculum_subject_id = v_exam.curriculum_subject_id
            AND tca.deleted_at IS NULL
            AND tca.teacher_id IS NOT NULL
          ORDER BY tca.id
          LIMIT 1
        )
      ),
      v_assignment.sy_id,
      v_exam.curriculum_subject_id,
      v_assignment.grade_level_id,
      v_exam.quarter_id,
      v_assignment.section_type,
      60,
      v_item_scores,
      v_most_learned,
      v_least_learned,
      v_now,
      p_generated_by
    )
    ON CONFLICT (exam_id, section_id) DO UPDATE SET
      teacher_id = EXCLUDED.teacher_id,
      sy_id = EXCLUDED.sy_id,
      curriculum_subject_id = EXCLUDED.curriculum_subject_id,
      grade_level_id = EXCLUDED.grade_level_id,
      quarter_id = EXCLUDED.quarter_id,
      section_type = EXCLUDED.section_type,
      mpl_threshold = EXCLUDED.mpl_threshold,
      item_scores = EXCLUDED.item_scores,
      most_learned = EXCLUDED.most_learned,
      least_learned = EXCLUDED.least_learned,
      generated_at = EXCLUDED.generated_at,
      generated_by = EXCLUDED.generated_by;
  END LOOP;

  UPDATE public.exams
  SET is_locked = true
  WHERE exam_id = p_exam_id
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'examId', p_exam_id,
    'gradeLevelId', v_first_grade_level_id,
    'sectionId', v_first_section_id,
    'finalized', true,
    'reportsSaved', true,
    'itemAnalysisReportsSaved', true
  );
END;
$$;
