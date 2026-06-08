-- Quick Win D4 — Cap finalize_exam_reports_atomic runtime with a statement_timeout.
--
-- finalize_exam_reports_atomic builds/drops several TEMP tables, creates a temp
-- index, and loops per assigned section doing a generate_series x CROSS JOIN
-- item analysis. It holds a pg_advisory_xact_lock for its entire run, so a
-- pathological exam (many sections / large rosters) could run long and hold
-- that lock — or hit the role's default statement_timeout and fail mid-way,
-- leaving the work to be retried.
--
-- Pin a generous per-function statement_timeout (120s) via ALTER FUNCTION so the
-- cap travels with the function and overrides the (smaller) role default for
-- THIS call only, without rewriting the ~200-line body. Equivalent in effect to
-- adding `SET LOCAL statement_timeout = '120000';` as the first body statement.
--
-- To roll back:
--   ALTER FUNCTION public.finalize_exam_reports_atomic(integer, uuid) RESET statement_timeout;

ALTER FUNCTION public.finalize_exam_reports_atomic(integer, uuid)
  SET statement_timeout = '120000';
