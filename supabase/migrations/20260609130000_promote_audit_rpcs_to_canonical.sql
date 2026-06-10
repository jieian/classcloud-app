-- Promotion pass: collapse every audited *_v2 function back to its canonical name.
--
-- Strategy per function: DROP the original (its return type changed, so it must go)
-- then ALTER FUNCTION ... RENAME the proven _v2 body into the canonical name. RENAME
-- reuses the already-tested _v2 definition in place (no body re-transcription) and
-- preserves its properties (SECURITY DEFINER, search_path, grants).
--
-- Runs as one transaction in the SQL editor (all-or-nothing). After this, the routes
-- must call the canonical names (the _v2 names no longer exist) — deploy the matching
-- code with this migration.
--
-- ⚠ Return-SHAPE changes for old callers: create_exams_for_sections (TABLE -> jsonb
-- {exams,_audit}) and create_transfer_request (uuid -> jsonb {request_id,_audit}).
-- Any still-running OLD code that reads those return values will misread them — run
-- this together with the updated code. The rest only return extra keys old callers
-- ignore (they read `error`/`success`), so those are order-independent.

-- ── sections ────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rename_section(integer, text);
ALTER FUNCTION public.rename_section_v2(integer, text) RENAME TO rename_section;

DROP FUNCTION IF EXISTS public.set_section_adviser(integer, uuid);
ALTER FUNCTION public.set_section_adviser_v2(integer, uuid) RENAME TO set_section_adviser;

DROP FUNCTION IF EXISTS public.assign_section_adviser(integer, uuid);
ALTER FUNCTION public.assign_section_adviser_v2(integer, uuid) RENAME TO assign_section_adviser;

DROP FUNCTION IF EXISTS public.set_section_subject_teachers(integer, jsonb);
ALTER FUNCTION public.set_section_subject_teachers_v2(integer, jsonb) RENAME TO set_section_subject_teachers;

-- ── students + transfers ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.move_student_enrollment(text, integer, integer);
ALTER FUNCTION public.move_student_enrollment_v2(text, integer, integer) RENAME TO move_student_enrollment;

DROP FUNCTION IF EXISTS public.update_student_info(text, text, character varying, character varying, character varying, character);
ALTER FUNCTION public.update_student_info_v2(text, text, character varying, character varying, character varying, character) RENAME TO update_student_info;

DROP FUNCTION IF EXISTS public.soft_delete_student(text);
ALTER FUNCTION public.soft_delete_student_v2(text) RENAME TO soft_delete_student;

DROP FUNCTION IF EXISTS public.create_transfer_request(text, integer, integer, uuid);
ALTER FUNCTION public.create_transfer_request_v2(text, integer, integer, uuid) RENAME TO create_transfer_request;

DROP FUNCTION IF EXISTS public.approve_transfer_request(uuid, uuid);
ALTER FUNCTION public.approve_transfer_request_v2(uuid, uuid) RENAME TO approve_transfer_request;

-- ── curriculum + school year ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_curriculum(integer);
ALTER FUNCTION public.delete_curriculum_v2(integer) RENAME TO delete_curriculum;

DROP FUNCTION IF EXISTS public.delete_school_year_permanent(integer);
ALTER FUNCTION public.delete_school_year_permanent_v2(integer) RENAME TO delete_school_year_permanent;

DROP FUNCTION IF EXISTS public.toggle_quarter(integer, integer);
ALTER FUNCTION public.toggle_quarter_v2(integer, integer) RENAME TO toggle_quarter;

DROP FUNCTION IF EXISTS public.update_curriculum_full(integer, text, text, jsonb, jsonb);
ALTER FUNCTION public.update_curriculum_full_v2(integer, text, text, jsonb, jsonb) RENAME TO update_curriculum_full;

-- ── profile + exams ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_my_profile(text, text, text);
ALTER FUNCTION public.update_my_profile_v2(text, text, text) RENAME TO update_my_profile;

DROP FUNCTION IF EXISTS public.create_exams_for_sections(uuid, integer, integer, text, integer, text, jsonb);
ALTER FUNCTION public.create_exams_for_sections_v2(uuid, integer, integer, text, integer, text, jsonb) RENAME TO create_exams_for_sections;
