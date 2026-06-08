-- Quick Win D3 — Harden SECURITY DEFINER functions with an explicit search_path.
--
-- These three functions are SECURITY DEFINER but were created WITHOUT a pinned
-- search_path, so they run with the CALLER's search_path. That is a privilege-
-- escalation risk (a caller could shadow an unqualified object name) and a
-- latent correctness risk if the caller's search_path ever changes.
--
-- ALTER FUNCTION ... SET search_path pins it WITHOUT rewriting the bodies
-- (minimal, reversible). All three resolve their object references against the
-- public schema today, so pinning 'public' is behaviour-preserving. This
-- mirrors the pattern already used by assign_subject_coordinator / most other
-- functions in this database.
--
-- Signatures taken from the current DB state (RPCs.txt). To roll back:
--   ALTER FUNCTION ... RESET search_path;

ALTER FUNCTION public.assign_grade_subject_leader(integer, integer, uuid)
  SET search_path TO 'public';

ALTER FUNCTION public.create_curriculum_full(text, text, jsonb, jsonb)
  SET search_path TO 'public';

ALTER FUNCTION public.create_school_year_full(integer, integer, integer, integer, jsonb, jsonb, jsonb)
  SET search_path TO 'public';
