-- Change subjects uniqueness from code-only to (code, subject_type).
-- This allows the same subject code to exist for different section types
-- (e.g. MATH1 as BOTH and MATH1 as SSES are now distinct subjects).
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_code_subject_type_key UNIQUE (code, subject_type);
