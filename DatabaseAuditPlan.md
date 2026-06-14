# ClassCloud Database Audit — Full Technical Plan (validated against app code)

Validation pass performed against the live codebase: lib/redis.ts, lib/cache-keys.ts, lib/active-context.ts, lib/supabase/server.ts, proxy.ts, lib/rate-limit.ts, lib/services/classService.ts, app/api/badges, app/api/announcements, app/api/notifications, hooks/usePermissionsSync.ts. Findings below reflect what the code actually does, not just what the DB files imply.

## Progress

- **#3 DONE (code, 2026-06-12)** — proxy.ts now getClaims()-first, getUser() fallback-only. Payoff requires asymmetric JWT signing keys in the Supabase dashboard.
- **#19 migration written** — `supabase/migrations/20260612120000_revoke_rpc_execute.sql` (keeps `check_email_exists` + `update_my_profile` for authenticated — verified client-side callers; all other privileged RPCs → service_role only). PENDING DB APPLY.
- **#15 + #16 migration written** — `supabase/migrations/20260612120100_rls_lockdown_pending_registrations_exams.sql` (pending_registrations → no client read policy; exams → SELECT-only, verified client reads exist / client writes don't). REVISED 2026-06-12: first apply left the pending_registrations public-read policy in place (single `DROP POLICY IF EXISTS` no-ops on any name mismatch); rewrote to ENABLE RLS + a DO-block that drops ALL policies on the table by name (idempotent, name-independent). Verification now also checks `relrowsecurity = true`. RE-RUN the pending_registrations block. exams part already applied correctly.
- **#29 migration written** — `supabase/migrations/20260612120200_drop_delete_user.sql`. DECISION (2026-06-12): `delete_user` is orphaned dead code — zero callers; the live "delete user" button uses `soft_delete_user_atomic` (retains scores/exams/reports), and pending-user rejection hard-deletes via `auth.admin.deleteUser()` cascade. Rather than repair a dangerous hard-purge nobody invokes, DROP it. (Also omitted from the #19 revoke list.) PENDING DB APPLY.
- **#30 migration written** — `supabase/migrations/20260612120300_fix_approve_transfer_request.sql` (approve before enrollment soft-delete + clear cancellation_reason + one-time data repair of corrupted APPROVED rows). PENDING DB APPLY.
- **#31 migration written** — `supabase/migrations/20260612120400_fix_update_student_info_lrn.sql` (repoints section_transfer_requests.lrn before deleting the old students row). PENDING DB APPLY.

Apply order: 120300/120400 anytime; 120200 anytime; 120000 + 120100 last in one sitting, then smoke-test login → classes page → settings/profile save → user-roles email check (the four paths touching kept grants/policies).

1. [CONNECTIONS] | RPCs.txt, pg_stats_statements.txt
   Problem: `finalize_exam_reports_atomic` sets `statement_timeout = 120000`, takes `pg_advisory_xact_lock`, row-locks the exam `FOR UPDATE`, and creates/drops 4 temp tables plus `CREATE INDEX` _inside a per-section loop_ — one observed call already took 266ms and the design permits 2-minute transactions.
   Why it hurts: On a 60-connection free tier with pgBouncer transaction pooling, a multi-minute transaction pins a backend for its full duration and the advisory lock serializes all finalizations, while per-loop temp-table DDL bloats pg_catalog.
   Fix direction: Rewrite as set-based CTEs computing all sections' stats in one pass (no temp tables, no loop), inserting both report tables with `INSERT ... SELECT ... ON CONFLICT`. Drop the in-loop `CREATE INDEX`; lower the timeout to a realistic bound.
   Severity: High
   DEFERRED 2026-06-12 (deliberate — needs validation, not a blind rewrite): A full set-based rewrite of this ~200-line statistics function (COUNT FILTERs, ROUND/NULLIF divisions, item-analysis generate_series) can't be verified without running it against real exam data; a transcription/aggregation error would silently corrupt report numbers in a grading system. The safe micro-wins also require reproducing the whole function (plpgsql replaces wholesale): the per-loop `CREATE INDEX ON tmp_report_students` is provably value-neutral but low-value. Lowering `statement_timeout` (120s) is NOT safe in isolation — statement_timeout includes advisory-lock WAIT time, and finalizations serialize on `pg_advisory_xact_lock`, so a queued-behind-another finalize legitimately needs the headroom. RECOMMENDED next step as its own effort: write the set-based version alongside the current one, run BOTH over existing finalized exams and diff every output column to prove equivalence, then swap. Not shipped blind.

2. [CONNECTIONS] | pg_stats_statements.txt, hooks/usePermissionsSync.ts
   Problem: Realtime is enabled (daily `realtime.messages` partition DDL, publication polling) and every logged-in browser holds a websocket — but it carries only the permissions-invalidation Broadcast channel; badges and notifications still poll REST (`/api/badges` + `/api/notifications` per navigation, 113 calls each in the sample).
   Why it hurts: The system pays Realtime's standing connection cost AND polling's per-request cost for the same "did something change" question, both drawing on the 60-connection budget.
   Fix direction: Extend the existing per-user Broadcast channel (already built in usePermissionsSync) to push badge/notification invalidation events, letting clients fetch only on signal instead of polling every navigation — this is the already-planned Broadcast upgrade; prioritize it.
   Severity: Medium
   DONE 2026-06-12 (code; tsc clean): Reused the proven permissions-sync Broadcast pattern. `lib/badgeChannels.ts` (dependency-free shared channel names: `badges:<uid>`, `badges:transfers`, event `changed`). badgeCache.ts invalidate functions now ALSO `admin.channel(...).httpSend("changed", {})` after the Redis evict — so the #4 chokepoints (insertNotifications, mark-read, the 4 transfer routes) broadcast for free; signals are content-free (counts come from the authenticated /api/badges re-fetch). New `hooks/useBadgeSync.ts` mirrors usePermissionsSync (per-user channel always + shared transfer channel for reviewers, 300ms debounce, reconnect-recovery with jitter, 10-min fallback poll). NavBar calls `useBadgeSync(user.id, isAdmin, fetchBadges)`; its navigation/focus fallback throttle raised 30s → 1min now that Broadcast provides liveness. Result: notification/signup/transfer badges update LIVE (incl. multi-tab) instead of stale-until-navigation. new-signup ALSO live: `notify_new_signup` now RETURNS recipient uids (migration 20260612121500_notify_new_signup_returns_uids.sql — DROP+CREATE since return type changed; re-grants service_role EXECUTE) and dispatchNewSignup calls invalidateNotificationBadge(uids) (evict + broadcast). report-completion intentionally NOT realtime (user decision — rare, not time-critical; bypasses insertNotifications so its badge updates on next nav/focus/fallback within the 60s TTL). Verify in running app: trigger a notification/transfer/signup for a logged-in recipient → badge updates without reload.

3. [CONNECTIONS / QUERY PERFORMANCE] | pg*stats_statements.txt, proxy.ts, lib/supabase/server.ts
   Problem: PostgREST `set_config` context setup is ≈43% of sampled DB time and the Supabase auth chain (`auth.users`/`sessions`/`identities`/`mfa*\*`, ~2,000 calls each) another ≈25%. Partially mitigated already: `getServerUser`uses`getClaims()`(local JWT verify) wrapped in React`cache()`, and proxy.ts skips prefetches. But proxy.ts:60 still calls `auth.getUser()`— a full Auth-server round trip — on **every real page navigation**, and`getClaims()`silently falls back to an Auth-server call unless the project has asymmetric JWT signing keys enabled.
Why it hurts: A fixed 6–8 query tax per navigation dominates total DB load at light traffic — this is the primary "unhealthy under light load" mechanism.
Fix direction: Switch proxy.ts to the same`getClaims()`-first pattern (getUser fallback only when claims are invalid/expired); verify in Supabase dashboard that asymmetric signing keys are active so the fast path is real; then reset pg_stat_statements and re-baseline to confirm the auth chain share collapses.
   Severity: Critical

4. [QUERY PERFORMANCE / CACHING] | TopCostly.txt, app/api/badges/route.ts, RPCs.txt
   Problem: `/api/badges` calls the `get_badge_counts` RPC on every poll with zero caching — it is the #1 application query (113 calls, 61.6ms avg, 721ms max), including a global `count(*) FROM section_transfer_requests WHERE status='PENDING'`. (Verified: the route already consolidates three fetches into one RPC and computes permission flags server-side — the remaining gap is purely the missing cache.)
   Why it hurts: A per-navigation, per-user uncached RPC with 700ms worst case scales linearly with users × navigations and stacks on the per-request auth tax.
   Fix direction: Wrap it in the existing `withRedisCache` helper keyed per user with a short TTL (15–60s), and `redis.del` the key from the writes that change counts (notification insert in lib/notifications.ts, transfer status changes); pair with the item-2 Broadcast push to drop polling entirely.
   Severity: High
   DONE 2026-06-12 (tsc clean):
   • New `lib/services/badgeCache.ts`: `getNotificationBadge(uid)` (cached `badges:notif:<uid>`, TTL 60, returns {notifications, signupNotifications} from one unread-rows query) + `getPendingTransferBadge()` (cached `badges:transfer_pending`, TTL 30, ONE global key — same number for all reviewers, avoids fan-out) + `invalidateNotificationBadge(uid|uids)` / `invalidatePendingTransferBadge()`.
   • `/api/badges` rewired to the two cached getters (gates transfer on students.full_access, zeroes signup unless users.full_access); no longer calls get_badge_counts (RPC now dead — already EXECUTE-revoked by #19, can drop later). The two legacy per-count endpoints still used by ClassesClient (`/api/notifications/count`, `/api/classes/transfer-requests/count`) also rewired to the same cache.
   • Precise invalidation: notif badge evicted at the single `insertNotifications` chokepoint in lib/notifications.ts (covers ALL TS dispatchers) + on mark-read; transfer badge evicted in the 4 transfer routes (create/approve/reject/cancel). TTL backstops the 2 SECURITY DEFINER insert RPCs (notify_new_signup, notify_report_completion) and trigger-driven transfer cancellations (unenroll/section-delete/user-soft-delete) — documented in badgeCache.ts.
   NOTE: item-2 Broadcast push (stop polling entirely) still not done — this caches the polled reads; polling itself remains.

5. [QUERY PERFORMANCE / CACHING] | lib/services/classService.ts, TopCostly.txt, lib/supabase/client.ts
   Problem: Client-side services use the **browser** supabase client against PostgREST directly — `fetchSchoolYears`, `fetchGradeLevels`, and `fetchSectionsForYear` (classService.ts:105–153) fetch `school_years`, `grade_levels`, `sections` (+users embed), and **every enrollment row of the school year** just to count students per section client-side. This exactly matches the repeated TopCostly shapes (school_years ×84, sections ×60+19, enrollments ×60, user-name lookups ×179) — and it bypasses the server-side Redis caches that already exist for this data (sys:active_context, Next.js data cache).
   Why it hurts: Each browser-direct read pays full PostgREST context-setup cost, multiplies request fan-out per page view, transfers N rows to count them, and structurally depends on the wide-open RLS policies (item 17) while skipping rate limiting (item 21).
   Fix direction: Move these reads behind Next.js API routes (or server components) that use the established `withRedisCache`/data-cache pattern; replace the enrollments row-fetch with a grouped count (RPC `GROUP BY section_id` or PostgREST count) computed server-side and cached. Audit the other `lib/services/*` files importing `@/lib/supabase/client` for the same pattern.
   Severity: High
   DONE 2026-06-12 (reference-data reads migrated; tsc clean):
   • Batch 1 (classService + gradeLevelService). New routes: GET /api/school-years + /api/grade-levels (served from the existing `getSchoolYearsCached`/`getGradeLevelsCached` Next.js data cache), /api/me/teaching-assignments (per-user, session-derived uid — no longer accepts a uid param, so users can't read others' assignments), /api/students/check-lrn + /api/classes/check-name (advisory collision checks, behaviour-preserving). classService.ts: fetchSchoolYears/fetchGradeLevels/checkLrnExists/fetchTeacherClassAssignments/checkSectionNameExists rewired; getSupabase import removed (classService is now isomorphic). Dead code DELETED: fetchSectionsForYear (the all-enrollments-row offender — superseded by server-side buildSectionCardsForSy) and fetchTeacherAssignedSectionIds (no callers). gradeLevelService.ts rewired to /api/grade-levels. 4 fetchTeacherClassAssignments callsites drop the uid arg (readiness guards kept). VERIFIED in app by user (login, exam-create modals, rename-edit, check-lrn).
   • Batch 2 (exam-create reference data). New cached server fetchers in `app/(app)/exam/_lib/examRefDataServerService.ts` (getActiveSectionsCached/getActiveQuartersCached/getActiveSubjectsWithGradeLevelsCached — "use cache" + cacheLife("hours"), tagged sections/school-years/subjects + active-context so existing classes/curriculum/schoolYear/toggle-quarter mutation routes already invalidate them). New routes GET /api/sections/active, /api/quarters/active, /api/subjects/active (gated on exams.limited_access). sectionService/quarterService/subjectService rewired to fetch them (signatures + return types preserved → no callsite changes); browser `supabase` value import dropped from all three. tsc clean.
   REMAINING (NOT part of #5's core — separate larger surface, assess case-by-case): exam-flow services examService/attemptService/omrService/examPdfService/reportsAnalysisService still use the browser client; some are interactive scan/grade paths that may legitimately stay client-side.

6. [QUERY PERFORMANCE] | TopCostly.txt, lib/services/auditLogsService.ts (path), DatabaseSchema.txt
   Problem: The audit-log list runs PostgREST's exact-count CTE (`SELECT ... FROM audit_logs` count subquery) — a full-table scan per page view (20 calls, 11ms avg, grows with table size).
   Why it hurts: Exact `count(*)` over an append-heavy log scales O(table size) per page load; `audit_logs` only grows between 90-day prunes.
   Fix direction: Request `Prefer: count=planned` (or drop the count and use keyset has-more pagination on `created_at DESC`, served by `idx_audit_created_at`).
   Severity: Medium
   NOT DONE 2026-06-12 (deliberate): the audit-logs page uses numbered pagination — `total` drives totalPages, "page N of M", and "Showing X–Y of Z entries" (AuditLogsClient.tsx). `count=planned` makes all of that an ESTIMATE — a visible UX regression on an admin-only view for negligible gain (audit_logs is pruned at 90 days and viewed infrequently; the exact-count scan is ~ms and bounded). Keyset has-more would remove total entirely — disproportionate refactor. Recommend leaving as-is unless approximate counts are acceptable, in which case it's a one-line `{ count: "planned" }` swap.

7. [QUERY PERFORMANCE] | IndexesUsage.txt, Indexes.txt
   Problem: `idx_exams_created_at` shows 615 scans reading 39,510 rows (~64 rows/scan) — an unfiltered "all exams ordered by created_at" pattern, even though `idx_exams_creator_created_active` exists for creator-scoped lists.
   Why it hurts: An unfiltered sorted fetch reads the whole exams table per request and grows with every school year of history.
   Fix direction: Scope the exam list by quarter/SY (or creator) with a matching composite (e.g. `(quarter_id, created_at DESC) WHERE deleted_at IS NULL`) and keyset pagination.
   Severity: Medium
   DONE/RE-SCOPED 2026-06-12: On inspection the query (examService.fetchExamsWithRelations) is ALREADY quarter-scoped (`WHERE quarter_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, ~64 rows/scan — not unfiltered). So this was a micro-opt, not a fix. `supabase/migrations/20260612122100_exams_quarter_created_index.sql` adds the matching composite idx_exams_quarter_created_active so the planner skips the sort; idx_exams_created_at left for the fresh-stats index pass. PENDING DB APPLY.

8. [INDEXES] | RPCs.txt, IndexesUsage.txt, Indexes.txt
   Problem: `toggle_quarter`'s completeness check and `notify_report_completion` filter `exam_results_reports` by `(section_id, curriculum_subject_id, quarter_id)`, but only single-column indexes exist — `idx_exam_results_reports_section_id` shows 227 scans reading 17,108 rows (75 read per scan, then filtered).
   Why it hurts: Every quarter toggle and report-completion check re-reads all of a section's reports instead of an exact probe, inside the post-finalize hot path.
   Fix direction: Add a composite on `exam_results_reports (section_id, curriculum_subject_id, quarter_id)` and drop the then-redundant single-column `section_id` index.
   Severity: Medium
   DONE 2026-06-12: `supabase/migrations/20260612120700_idx_exam_results_reports_section_cs_quarter.sql` — adds `idx_err_section_cs_quarter` (create-before-drop), drops `idx_exam_results_reports_section_id` (covered by the composite's section_id prefix). Plain build (small table); CONCURRENTLY noted for large tables. PENDING DB APPLY.

9. [INDEXES] | RPCs.txt, Indexes.txt
   Problem: `notify_report_completion` repeatedly probes `exams` with `curriculum_subject_id = X AND quarter_id = Y AND deleted_at IS NULL` (in `expected`, `unfinalized`, and the latest-exam `NOT EXISTS`), but only cs-only (`idx_exams_curriculum_subject_active`) and quarter-only indexes exist.
   Why it hurts: These probes nest 3 levels deep per section on every exam finalization.
   Fix direction: Add `exams (curriculum_subject_id, quarter_id) WHERE deleted_at IS NULL`, replacing `idx_exams_curriculum_subject_active`.
   Severity: Medium
   DONE 2026-06-12: `supabase/migrations/20260612120800_idx_exams_cs_quarter.sql` — adds partial `idx_exams_cs_quarter_active`, drops `idx_exams_curriculum_subject_active` (covered by the composite's cs prefix + same partial predicate). `idx_exams_quarter_id` kept (serves quarter-only filters). PENDING DB APPLY.

10. [QUERY PERFORMANCE] | IndexesUsage.txt, RPCs.txt
    Problem: `subjects_pkey` shows 580,318 scans, `exams_pkey` 195,395, `grade_levels_pkey` 154,880, `permissions_pkey` 140,876 — hundreds of nested-loop PK lookups per API request from PostgREST LATERAL embeds and per-row joins inside list RPCs (index counters span a longer window than the reset statements stats).
    Why it hurts: Row-at-a-time join multiplication makes every list endpoint cost hundreds of index probes, compounding RLS evaluation and connection hold time.
    Fix direction: Largely absorbed by the existing Redis caches (these RPCs now run only on cache miss — verified); remaining action is item 5's client-direct embeds and avoiding deep PostgREST resource embedding on any new hot list.
    Severity: Low
    RESOLVED 2026-06-12 (no action): the remaining lever was #5's client-direct PostgREST embeds, which are now migrated to cached server routes (#5 DONE). The high-volume PK-lookup counters were dominated by those + cache-miss refills; nothing further to do here beyond not adding deep PostgREST resource embedding on new hot lists.

11. [INDEXES] | Indexes.txt, IndexesUsage.txt
    Problem: Five full/partial duplicate pairs index the same columns: `idx_tca_section_id` vs `idx_teacher_class_assignments_section_id_active`, `idx_tca_curriculum_subject_id` vs `..._cs_id_active`, `idx_enrollments_section_sy` vs `..._active`, `idx_sections_sy_id` vs `..._active`, `idx_sections_adviser_sy` vs `idx_sections_adviser_active`.
    Why it hurts: Every write maintains both copies; the partial variants on `sections` show 0 scans while the full ones take all traffic.
    Fix direction: Keep one per column set — generally the full index (also serves FK-enforcement scans over soft-deleted rows) — and drop the twin.
    Severity: Medium

12. [INDEXES] | IndexesUsage.txt
    Problem: ~25 secondary indexes show zero scans, including the entire `section_transfer_requests` secondary family (`idx_str_lrn_status`, `idx_str_requested_by`, `idx_str_to_section`, `idx_str_pending_from_requested_at`, `idx_str_originally_intended_reviewer`, `idx_str_reviewed_by`), `idx_item_analysis_reports_{sy_id,sy_section,teacher_id,grade_level_id,generated_by}`, `idx_announcements_author_id`, `idx_school_years_curriculum_id`, `idx_roles_lower_name`, `idx_roles_is_faculty`, `idx_quarters_sy_id_is_active`, `idx_grade_subject_leaders_{user_id,grade_level_id}`, `idx_curriculum_subjects_{grade_level_id,curriculum_active}`.
    Why it hurts: Pure write overhead — tables are 16kB so the planner seq-scans regardless.
    Fix direction: After confirming over a longer window, drop unused non-unique indexes; keep unique constraints and one FK-supporting index per referencing column on tables that will grow (re-check the `section_transfer_requests` set before dropping — it will grow).
    Severity: Medium

13. [INDEXES] | Indexes.txt, IndexesUsage.txt, TopCostly.txt
    Problem: `idx_announcements_published_feed` (partial on `status='PUBLISHED' AND deleted_at IS NULL`) has 0 scans even though the feed query filters exactly that — the query arrives with `status = $8` as a bind parameter, and a generic plan cannot prove a partial-index predicate; tiny table size further biases to seq scan.
    Why it hurts: Dead weight on every announcement write; the query it exists for can't reliably use it. (Low practical impact today since the feed is Redis-cached at TTL 120s — verified in app/api/announcements/route.ts.)
    Fix direction: Replace with a non-partial composite `(sy_id, is_pinned DESC, published_at DESC)` (optionally `WHERE deleted_at IS NULL`, which parameterized queries can prove), or inline the literal status server-side.
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612122000_announcements_feed_index.sql` — +idx_announcements_feed (sy_id, is_pinned DESC, published_at DESC) WHERE deleted_at IS NULL (predicate the parameterized query can prove), -idx_announcements_published_feed (status='PUBLISHED' partial — unprovable from a bind param). PENDING DB APPLY.

14. [INDEXES / SCHEMA] | Indexes.txt
    Problem: `subjects` carries two contradictory uniques: `subjects_code_subject_type_key UNIQUE (code, subject_type)` (includes soft-deleted rows) and `subjects_code_unique UNIQUE (lower(code)) WHERE deleted_at IS NULL`. The former shows 0 scans.
    Why it hurts: The (code, subject_type) constraint is unreachable for active rows yet blocks re-creating a soft-deleted subject's code with the same type — a latent insert failure the `unique_violation` handlers will misreport.
    Fix direction: Drop `subjects_code_subject_type_key`; keep the case-insensitive partial unique as the single source of code uniqueness.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612121600_drop_subjects_code_subject_type_unique.sql` — DROP CONSTRAINT IF EXISTS + DROP INDEX IF EXISTS (covers whether the `_key` name backs a constraint or a bare index). subjects_code_unique (active, case-insensitive) remains the sole code-uniqueness rule. PENDING DB APPLY.

15. [RLS / SECURITY] | RLSPolicies.txt, DatabaseSchema.txt
    Problem: `pending_registrations` has `SELECT USING (true)` for authenticated users — the table contains `encrypted_password`, `token_hash`, and `email` for every in-flight registration.
    Why it hurts: Any authenticated account (including self-registered, not-yet-approved users, who still hold `authenticated`) can dump password material and valid registration token hashes via PostgREST.
    Fix direction: Drop the policy — this table is service-role-only (all app access goes through adminClient routes; verified). Also verify `user_invitations` (token_hash/encrypted_password) has RLS enabled with zero policies.
    Severity: Critical

16. [RLS / SECURITY] | RLSPolicies.txt, DatabaseSchema.txt
    Problem: `exams` has `"exam policy" FOR ALL USING (true)` — any authenticated user can SELECT/INSERT/UPDATE/DELETE any exam via PostgREST, including reading/altering `answer_key` and flipping `is_locked`.
    Why it hurts: Exam integrity (locking, `create_score` validation, finalized reports) is bypassable by one PostgREST PATCH from any logged-in account.
    Fix direction: Replace with a SELECT-only policy (excluding `answer_key` via a view or column grants) or remove client access entirely — exam reads/writes already flow through server routes; confirm no browser code reads `exams` directly before locking down.
    Severity: Critical

17. [RLS / SECURITY] | RLSPolicies.txt, DatabaseSchema.txt, lib/services/classService.ts
    Problem: Blanket `SELECT USING (true)` exposes `scores` (all grades + responses), `students` (minors' PII), `enrollments`, `users` (incl. `must_change_password`), `audit_logs` (old/new value jsonb of every admin action), `teacher_class_assignments`, and more to any authenticated user, with no `users.active_status = 1` gate — and roles are self-registerable, so unapproved accounts hold `authenticated`. Caveat (validated): some of these policies are load-bearing — browser-direct reads in classService and siblings rely on them.
    Why it hurts: A self-registered account that confirms its email can bulk-read the school's academic, PII, and audit record before any admin approves it.
    Fix direction: First migrate browser-direct reads behind server routes (item 5), then add an `is_active_staff()` SECURITY DEFINER helper (`active_status = 1 AND deleted_at IS NULL`, wrapped in `(SELECT ...)`) as the floor of every remaining read policy, and tighten `scores`/`students`/`audit_logs`/`pending_registrations` to permission-scoped or service-role-only. Sequence matters: tightening before the migration breaks the classes UI.
    Severity: Critical
    DONE 2026-06-12: `supabase/migrations/20260612121400_rls_active_staff_floor.sql`. Worked from a REFRESHED RLSPolicies.txt (re-dumped from live DB after #15/#16/#18). Added `is_active_staff()` (SECURITY DEFINER, STABLE, GRANT EXECUTE to authenticated), DROPPED audit*logs' USING(true) read policy (→ service-role-only; written by service role only, read via permission-gated /api/audit-logs), and FLOORED the 23 remaining USING(true) SELECT policies via a name-independent DO-block (ALTER POLICY ... USING((SELECT public.is_active_staff())), guarded on qual='true' for idempotency). VERIFIED before shipping: postgres has BYPASSRLS=true (required so is_active_staff's read of users doesn't recurse AND existing SECURITY DEFINER fns reading floored tables keep working — confirmed via pg_roles); active users all pass the floor (no behavior change); inactive/pending users get graceful EMPTY reads (the one app-shell browser read, MustChangePasswordModal, uses .maybeSingle(); data pages are permission-gated). RLS status confirmed 8 tables already service-role-only (announcements+announcement*\*, grade_subject_leaders, pending_registrations, report_completion_milestones, user_invitations) → resolves #39/#42. PENDING DB APPLY.
    RESIDUAL — scores SCOPED 2026-06-12 (user chose "scores only"): the only browser reader of scores (attemptService, exam scan/grade) migrated to section-authorized routes GET /api/exams/[examId]/scores + POST /api/exams/scores/exists (require exams.limited_access; non-full-access caller must teach a section the exam touches — direct teacher_class_assignments query so it works for historical exams; mirrors /api/exams/scores/delete). `supabase/migrations/20260612122400_scores_service_role_only.sql` drops the scores read policy → service-role-only. ⚠ DEPLOY ORDER: code first, THEN migration (else scan view shows no scores). tsc clean. PENDING DB APPLY.
    STILL RESIDUAL (deliberately not done — user scoped to scores only): students/enrollments stay at the is_active_staff floor (active staff reading student names/enrollments is normal for school staff); exams.answer_key column-level hiding (#16 residual); users readable by active staff — all accepted.

18. [RLS / SECURITY] | RLSPolicies.txt
    Problem: All three `section_transfer_requests` policies grant their admin branch via `roles.name = 'full_access_student_management'` — comparing a role _name_ against a permission-style string; the app's model uses permissions like `students.full_access` via `role_permissions` (verified in app/api/badges/route.ts and route guards).
    Why it hurts: Unless a role with that literal name exists, the admin branch is dead — admins see only requests where they are adviser/requester on client-side reads — and the policy silently diverges from the app's permission model.
    Fix direction: Rewrite the branch to join `user_roles → role_permissions → permissions` checking `permissions.name = 'students.full_access'`, mirroring route authorization.
    Severity: High
    DONE 2026-06-12: `supabase/migrations/20260612120600_fix_str_policies_permission.sql` — all three policies (str_select/insert/update) reproduced verbatim except the admin branch, now the role_permissions→permissions join on `students.full_access`; auth.uid() kept as `(SELECT ...)` for initplan caching; wrapped in BEGIN/COMMIT for an atomic swap. Defense-in-depth only (app mutates via service role, bypassing RLS). PENDING DB APPLY.

19. [RLS / SECURITY] | RPCs.txt
    Problem: Privileged SECURITY DEFINER functions have no internal caller check and trust identity parameters: `create_score`, `notify_new_signup`, `delete_announcement`/`delete_published_announcement`, `update_role_and_permissions`, `delete_role_with_detach`, `assign_faculty_academic_load`, `set_section_subject_teachers`, `activate_user_atomic`, `restore_user_atomic`, `create_announcement` (`p_author_id`), `finalize_exam_reports_atomic` (`p_generated_by`), `get_badge_counts`/`get_announcement_user_state` (`p_user_id`, capability flags). Validated: the app always calls these via server routes with the service role and server-derived parameters — the app code is clean — but PostgREST exposes `public` functions to `authenticated` by default, so direct `/rpc/*` calls bypass every route guard.
    Why it hurts: If EXECUTE hasn't been revoked from `authenticated`/`anon`, any logged-in (even unapproved) user can write grades, grant roles, spam admin notifications, or read other users' badge/read state — privilege escalation with zero app-code bugs involved.
    Fix direction: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on all of these (grant to `service_role` only); since the app never calls them client-side (verified), this is a zero-regression change. For any function intentionally client-callable later, derive identity from `auth.uid()` internally.
    Severity: Critical

20. [RLS] | RLSPolicies.txt, RPCs.txt
    Problem: The `section_transfer_requests` UPDATE/INSERT policies duplicate authorization already enforced by the transfer RPCs, which are invoked from server routes under the service role (bypassing RLS) — so the multi-`EXISTS` predicates only ever run on client-side reads.
    Why it hurts: Redundant per-row policy cost and two authorization sources that have already drifted (item 18).
    Fix direction: Keep one tight SELECT policy for client reads; drop UPDATE/INSERT policies if all mutations stay server-mediated (verify the transfer-requests client page reads via route, not PostgREST, first).
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612121900_drop_str_write_policies.sql` — verified NO browser-client writes to section_transfer_requests (all mutations server-mediated). Dropped str_insert + str_update (kept str_select). Beyond cleanup this closes a latent bypass — str_insert would have let an adviser INSERT a request via PostgREST skipping create_transfer_request's ALREADY_PENDING/NOT_ENROLLED validation. PENDING DB APPLY.

21. [CACHING / RATE LIMITING] | lib/rate-limit.ts, app/api/\*_, lib/services/classService.ts
    Problem: Rate limiting (Upstash sliding window, solid implementation) is applied to exactly five unauthenticated auth routes (signup, signup/resend, check-email, check-pending, forgot-password). No authenticated API route is limited, and the browser-direct PostgREST paths (item 5) plus `/rpc/_`have no limiter at all.
Why it hurts: The most-polled endpoints (badges, notifications, classes init) and the raw PostgREST surface can saturate the 60-connection pool from a single misbehaving or abusive client without ever hitting a limiter.
Fix direction: Apply`createRateLimiter` per-user (keyed on uid, not IP) to the polled authenticated routes with generous limits; eliminate the unlimitable browser→PostgREST surface by completing item 5 and locking RPC grants (item 19).
    Severity: Medium

22. [SCHEMA] | DatabaseSchema.txt, RPCs.txt
    Problem: Core relationship columns are nullable though every code path assumes presence: `enrollments.lrn/section_id/sy_id`, `scores.enrollment_id/exam_assignment_id`, `exam_assignments.exam_id/section_id`.
    Why it hurts: A NULL row from any buggy insert path silently vanishes from every join in finalize/reports/transfer logic instead of failing fast, producing wrong report totals.
    Fix direction: `SET NOT NULL` after a backfill check; pure constraint additions on small tables.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612121000_not_null_relationship_columns.sql` — SET NOT NULL on enrollments.{lrn,section_id,sy_id}, scores.{enrollment_id,exam_assignment_id}, exam_assignments.{exam_id,section_id}, atomic (BEGIN/COMMIT). Includes a pre-check query (expect all zeros); SET NOT NULL validates existing data and errors safely if any NULLs exist. PENDING DB APPLY.

23. [SCHEMA] | DatabaseSchema.txt, RPCs.txt
    Problem: `exams.quarter_id` is nullable, but `finalize_exam_reports_atomic` raises `MISSING_REPORT_CONTEXT` and `notify_report_completion` exits early when NULL; `create_exams_for_sections` always supplies it.
    Why it hurts: A nullable column the pipeline hard-requires converts a schema guarantee into scattered runtime errors.
    Fix direction: Backfill then `SET NOT NULL` on `exams.quarter_id`.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612121100_exams_quarter_id_not_null.sql` — DO-block guard that RAISEs a clear, actionable error (listing how to find offending exams) if any quarter_id IS NULL, else applies SET NOT NULL. Legacy NULL exams (if any) can't be auto-backfilled — must be assigned a quarter or soft-deleted first, then re-run. PENDING DB APPLY.

24. [SCHEMA / CORRECTNESS] | DatabaseSchema.txt, RPCs.txt
    Problem: `students.full_name` and `school_years.year_range` are declared as insert-time `DEFAULT` expressions referencing other columns (per the dump), not `GENERATED ... STORED`; `update_student_info` updates name parts without touching `full_name`.
    Why it hurts: If these are truly defaults, every rename leaves a stale `full_name` feeding transfer UIs, audit labels, and report snapshots.
    Fix direction: Verify `pg_attribute.attgenerated` in the live catalog; if plain defaults, convert to stored generated columns.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612121200_generated_full_name_year_range.sql` — converts students.full_name and school_years.year_range to STORED generated columns (drop + re-add; re-add recomputes every row, repairing existing stale values). Verified safe first: nothing inserts/updates these columns explicitly (both students inserts + create_school_year_full omit them), and no index/view depends on them — so the generated-column write restriction breaks nothing. Generated expressions reproduce the prior DEFAULT expressions exactly. PENDING DB APPLY.

25. [SCHEMA] | DatabaseSchema.txt
    Problem: `enrollments` and `teacher_class_assignments` have no `created_at` (enrollments has no timestamps besides `deleted_at`) despite being the most history-sensitive tables.
    Why it hurts: "When was this student enrolled/moved" is unanswerable for audit/debugging, and delta queries have no watermark.
    Fix direction: Add `created_at timestamptz NOT NULL DEFAULT now()` to both.
    Severity: Low

26. [SCHEMA] | DatabaseSchema.txt
    Problem: `pending_registrations.role_ids integer[]` carries role references with no FK enforcement; `restore_uid` has no FK.
    Why it hurts: Deleting a role leaves dangling IDs that `confirm_pending_registration` inserts into `user_roles`, where the real FK aborts the whole confirmation.
    Fix direction: Filter `unnest(role_ids)` through a join against `roles` inside the RPC; add the `restore_uid` FK with `ON DELETE SET NULL`.
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612122300_pending_registrations_fk_role_validation.sql` — confirm_pending_registration reproduced verbatim except the role insert now JOINs public.roles (skips stale ids instead of aborting on the user_roles FK); restore_uid FK → public.users(uid) ON DELETE SET NULL, with dangling values nulled first so the add can't fail. PENDING DB APPLY.

27. [SCHEMA / RELIABILITY] | RPCs.txt, DatabaseSchema.txt
    Problem: `check_attachment_limit` enforces max-3 attachments via a `COUNT(*)` trigger (not concurrency-safe), and there is no `UNIQUE (announcement_id, display_order)` despite the 1–3 CHECK.
    Why it hurts: Concurrent inserts can both pass the count check; duplicate display_orders render unpredictably.
    Fix direction: Replace the trigger with `UNIQUE (announcement_id, display_order)` — combined with the CHECK it enforces the cap atomically.
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612122200_attachment_limit_unique.sql` — dup-pair guard (RAISE if any exist) → drop check_attachment_limit trigger (found via pg_trigger by tgfoid) + function → ADD UNIQUE(announcement_id, display_order). With the 1..3 CHECK this caps at 3 atomically. PENDING DB APPLY.

28. [SCHEMA] | DatabaseSchema.txt
    Problem: `roles.name` has `DEFAULT '50'::character varying` — a stray literal default on a unique business-key column.
    Why it hurts: An insert that omits `name` creates a role named "50" once, then unique-violates forever.
    Fix direction: Drop the default.
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612121800_drop_roles_name_default.sql` (ALTER COLUMN name DROP DEFAULT). PENDING DB APPLY.

29. [CORRECTNESS] | RPCs.txt, DatabaseSchema.txt — RESOLVED 2026-06-12 (DROP, not repair)
    Problem: `delete_user` executes `DELETE FROM public.grade_level_coordinators` — a table that does not exist (the real table is `grade_subject_leaders`, which the function never touches); even fixed, notification/audit FK references would block the final `DELETE FROM users`.
    Resolution: Validated that `delete_user` has ZERO callers anywhere. The frontend "delete user" button and `/api/users/delete-auth` (soft branch) use `soft_delete_user_atomic` — which RETAINS scores/exams/exam_assignments/reports/approved+rejected transfer requests and only soft-deletes assignments + nulls adviser + cancels PENDING requests + stamps `users.deleted_at`. Pending-user rejection (hard branch) calls `auth.admin.deleteUser()` directly, relying on the auth.users→public.users FK cascade (safe — never-activated users hold no academic data). `delete_user` is orphaned dead code, so it was DROPPED (`supabase/migrations/20260612120200_drop_delete_user.sql`) rather than repaired: a repaired hard-purge would destroy academic history and nothing calls it.
    Severity: High (closed)

30. [CORRECTNESS] | RPCs.txt
    Problem: `approve_transfer_request` soft-deletes the from-enrollment _before_ updating request status; the `handle_enrollment_soft_delete` trigger fires and sets the still-PENDING request to `CANCELLED / STUDENT_UNENROLLED`; the RPC's final UPDATE then sets `APPROVED` but never clears `cancellation_reason`.
    Why it hurts: Every approved transfer ends up `APPROVED` with a stale `cancellation_reason='STUDENT_UNENROLLED'`, corrupting the history the transfer-requests UI and audits display.
    Fix direction: Set status to APPROVED before the enrollment soft-delete (the row lock prevents races), or explicitly `cancellation_reason = NULL` in the final UPDATE.
    Severity: High

31. [CORRECTNESS] | RPCs.txt, DatabaseSchema.txt
    Problem: `update_student_info` handles LRN changes by inserting a new `students` row, repointing `enrollments`, then deleting the old row — but `section_transfer_requests.lrn` also FKs students and is never repointed.
    Why it hurts: Changing the LRN of any student with transfer history aborts with an FK violation.
    Fix direction: Repoint `section_transfer_requests.lrn` in the same transaction, or declare the FK `ON UPDATE CASCADE` and use a plain UPDATE.
    Severity: High

32. [CORRECTNESS] | RPCs.txt
    Problem: Proficiency banding is duplicated with diverging labels: `create_score` stores `'Nearly'/'Low'/'Not'` in `scores.proficiency_level`; `finalize_exam_reports_atomic` recomputes `'Nearly Proficient'/'Low Proficient'/'Not Proficient'` for reports.
    Why it hurts: The stored per-score label and the official report disagree for identical scores.
    Fix direction: Centralize banding in one IMMUTABLE SQL function used by both, or drop the stored derived columns and always derive.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612120900_proficiency_band.sql`. Verified the app-wide canonical convention is the FULL labels (every reader + finalize use them); the only outliers were `create_score` AND the TS write-fallback in scores/create/route.ts (both used short 'Nearly'/'Low'/'Not'). Added IMMUTABLE `proficiency_band(numeric)` (full labels, single source of truth), reproduced create_score to call it, backfilled existing short-label `scores` rows, and fixed the TS fallback labels (tsc clean). finalize left untouched (already emits full labels — reproducing it just to call the helper is unjustified risk; it adopts the helper during the #1 rewrite). PENDING DB APPLY (migration) — TS already in working tree.

33. [CORRECTNESS] | RPCs.txt, DatabaseSchema.txt
    Problem: `delete_user` claims deleting `public.users` "cascades to auth.users automatically," but the FK points the other way — the auth account survives profile deletion.
    Why it hurts: A "deleted" user can still authenticate, holds `authenticated`, and (per items 15–17) can read broadly — a ghost-account hole.
    Fix direction: Have the server route call `auth.admin.deleteUser()` (service role) after the RPC, or rely on auth-side deletion cascading into public.users via `ON DELETE CASCADE`.
    Severity: Medium
    RESOLVED / MOOT 2026-06-12: the offending claim lived in `delete_user`, which was DROPPED (#29). The live deletion paths already handle the auth side correctly — `/api/users/delete-auth` soft branch bans the auth account (~100yr) via `auth.admin.updateUserById`, and the hard branch (pending-user rejection) calls `auth.admin.deleteUser()` directly. No ghost-account hole remains; no migration needed.

34. [RELIABILITY] | RPCs.txt
    Problem: `create_curriculum_full`, `update_curriculum_full`, and `delete_curriculum` end with `EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', SQLERRM)`.
    Why it hurts: Deadlocks, FK violations, and genuine bugs all become HTTP 200 + JSON, hidden from monitoring and half-handled by callers.
    Fix direction: Catch only the SQLSTATEs translated for the UI (`unique_violation`, in-use guards) and re-`RAISE` the rest.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612121700_curriculum_rpc_reraise_errors.sql` — all 3 functions reproduced verbatim from live defs, only the trailing EXCEPTION changed: create/update keep `WHEN unique_violation` (friendly DUPLICATE_SUBJECT_CODE) but `WHEN OTHERS THEN RAISE`; delete's catch-all removed entirely (no translated case). Verified route-safe: the curriculum routes already handle rpc `error` (→500) vs `{success:false}` guard (→409), and the in-use/has-exams/duplicate guards are plain RETURNs (unchanged). Stops the SQLERRM leak + restores monitoring visibility. CREATE OR REPLACE preserves #19 grants. PENDING DB APPLY.

35. [RELIABILITY] | RPCs.txt, DatabaseSchema.txt
    Problem: `set_section_subject_teachers` soft-deletes all active assignments for the section and re-inserts fresh rows on every save — including unchanged cells — unlike `assign_faculty_academic_load`, which diffs and revives.
    Why it hurts: `teacher_class_assignments` accumulates a dead row per subject per save forever (bloat + degraded partial-index selectivity), and assignment identity/history is destroyed.
    Fix direction: Adopt the diff/revive/insert pattern already implemented in `assign_faculty_academic_load` — the function computes the diff for its audit envelope anyway.
    Severity: Medium
    DONE 2026-06-12: `supabase/migrations/20260612122500_set_section_subject_teachers_diff.sql` — reproduced verbatim except the mutation: soft-delete only active rows the payload doesn't confirm (same subject+teacher), insert only teachers not already active (mirrors save_teaching_load_masterlist's pattern, not the heavier revive). Unchanged cells no longer churn. Soft-delete-before-insert ordering keeps the (section,cs) active-unique constraint safe. PENDING DB APPLY.

36. [RELIABILITY] | DatabaseSchema.txt, Indexes.txt, RPCs.txt, repo (no migrations)
    Problem: `section_transfer_requests.expires_at` defaults to +30 days and `idx_str_expires` exists, but no RPC, trigger, app route, or repo migration expires PENDING rows (verified: the only repo references to `expires_at` are display/signup code) — while `create_transfer_request` rejects any new request while _any_ PENDING row exists for the student.
    Why it hurts: One abandoned request permanently blocks all future transfers for that student unless manually cancelled.
    Fix direction: Add a pg_cron job (the cluster already runs cron for announcement publishing and pruning) flipping `status='CANCELLED', cancellation_reason='EXPIRED'` where expired; first confirm no such job already exists outside the repo (cron job list isn't in these files).
    Severity: Medium
    DONE 2026-06-12 (fully handled by user's cron — no migration): User already has the pg_cron job (UPDATE ... SET status='CANCELLED', cancellation_reason='EXPIRED', reviewed_at=now() WHERE status='PENDING' AND expires_at < now()). Logic verified correct + index-supported (idx_str_expires). The only risk (enum missing 'EXPIRED') was checked and ruled out — the cancellation_reason enum already contains EXPIRED (verified by querying pg_enum: STUDENT_UNENROLLED, SECTION_DELETED, REQUESTER_DEACTIVATED, PERMISSION_REVOKED, MOVED_BY_ADMIN, EXPIRED, MANUAL). The temporary safety-net migration was deleted as a confirmed no-op. reviewed_at=now() on auto-expiry is a harmless minor semantic choice (reviewed_by stays NULL).

37. [RELIABILITY] | RPCs.txt
    Problem: `save_teaching_load_masterlist` runs `UPDATE sections SET adviser_id = ...` for every payload entry even when unchanged (no `IS DISTINCT FROM` guard), rewriting rows and invoking the `handle_adviser_reassignment` trigger machinery per row.
    Why it hurts: Needless row versions/WAL on every masterlist save, proportional to section count rather than actual changes.
    Fix direction: Add `AND sections.adviser_id IS DISTINCT FROM (entry->>'adviser_id')::uuid` to the UPDATE — the diff CTE above it already computes this set.
    Severity: Low
    DONE 2026-06-12: `supabase/migrations/20260612122600_masterlist_adviser_guard.sql` — reproduced verbatim with the IS DISTINCT FROM guard added to the adviser UPDATE (the teaching block was already diff-guarded). Only sections whose adviser actually changes are rewritten. PENDING DB APPLY.

38. [QUERY PERFORMANCE] | RPCs.txt
    Problem: `update_curriculum_full` loops per subject with two cross-curriculum `EXISTS` probes each plus per-member inner loops for group rebuild — an N×M statement pattern inside one transaction.
    Why it hurts: Curriculum saves execute dozens-to-hundreds of statements holding locks and a pooled connection for the duration.
    Fix direction: Convert to set-based statements (`jsonb_to_recordset` joined once against `exams`/`curriculum_subjects` to classify all subjects, then bulk insert/update), mirroring `save_teaching_load_masterlist`'s style.
    Severity: Low
    NOT DONE 2026-06-12 (recommend skip): Low severity on an INFREQUENT admin op (curriculum setup). The set-based rewrite is genuinely hard to do safely — the per-subject loop builds a tempId→curriculum_subject_id map that the subject-group rebuild depends on, and correlating that across a bulk INSERT...RETURNING is exactly what silently corrupts curriculum structure. High risk / low payoff on a function that can't be validated without running. Recommend leaving the per-subject loop as-is.

39. [SCHEMA / RLS] | DatabaseSchema.txt, RLSPolicies.txt
    Problem: `announcements`, `announcement_targets`, `announcement_attachments`, `announcement_reads`, `user_invitations`, `grade_subject_leaders`, and `report_completion_milestones` appear in no policy list — their posture is implicit (deny-all if the `rls_auto_enable` event trigger covered them, open if any predate it). App access is service-role via routes (verified for announcements), so deny-all is the _correct_ state — but it's unverified.
    Why it hurts: One forgotten table with RLS disabled (especially `user_invitations` with token hashes) is silently world-readable to authenticated users.
    Fix direction: Audit `pg_class.relrowsecurity` for every public table and explicitly enable RLS (zero policies = service-role-only) where client access isn't intended.
    Severity: Medium
    RESOLVED 2026-06-12 (verified, no migration): the RLS-status query run during #17 dumped relrowsecurity + policy_count for every public table. All the named tables (announcements, announcement_targets/attachments/reads, user_invitations, grade_subject_leaders, report_completion_milestones) are RLS-enabled with ZERO policies = service-role-only — the correct, intended posture. Nothing to change.

40. [CACHING — validation note] | lib/redis.ts, lib/cache-keys.ts, app/api/\*\*
    Problem: (Corrected finding.) The heavy admin-list RPCs flagged by TopCostly — `get_faculty_list`, `get_active_users_with_roles`, `get_subject_coordinator_groups`, `get_pending_users_with_details`, `get_grade_subject_leader_data`, roles, announcements feed, active context — are already read-through Redis-cached with TTLs and `redis.del` invalidation across all mutation routes; permissions ship in the JWT (`app_metadata`) with a Redis version key, so `get_user_permissions` runs only during sync. The observed RPC executions are cache-miss refills.
    Why it hurts: Residual cost only: every TTL expiry or invalidation pays the full 50–400ms RPC; under simultaneous misses (mass login after invalidation) several clients can refill concurrently.
    Fix direction: No structural change needed; optionally add a singleflight/lock around the most expensive refills (`withRedisCache` is the natural place) and lengthen TTLs where invalidation coverage is already complete.
    Severity: Low
    RESOLVED 2026-06-12 (no action needed): validation-note item — the admin-list RPCs are already Redis-cached with event invalidation. Optional singleflight on `withRedisCache` left undone deliberately (cache-stampede risk is low at this scale; adds lock complexity for marginal benefit). Revisit only if mass-login refill spikes appear.

ROOT CAUSE HYPOTHESIS: The dominant cost is fixed per-request overhead, not any single query: PostgREST `set_config` context setup (~43% of sampled DB time) plus the Supabase Auth chain (~25%) — and the largest remaining source of that chain is proxy.ts, which still calls `auth.getUser()` (a 5-query Auth-server round trip) on every real page navigation, with `getClaims()` only shipped for API routes and only effective if asymmetric signing keys are enabled. That fixed tax is multiplied by request fan-out the server-side Redis layer can't see: browser-direct PostgREST reads in lib/services (school years ×84, sections ×79, full enrollment-row fetches ×60, user-name lookups ×179) and the uncached `/api/badges` RPC polled per navigation (61ms avg, 722ms max). Connection budget pressure compounds it: `finalize_exam_reports_atomic` can pin a pooled backend for up to 2 minutes behind an advisory lock, and every logged-in client holds a Realtime websocket that currently only serves permission invalidation while badges/notifications still poll. The admin-list workload, by contrast, is already well-cached — the unhealthy load lives almost entirely in the paths that bypass the cache layer.

ESTIMATED IMPACT ORDER:

1. #3 — getClaims() in proxy.ts + confirm asymmetric signing keys: removes the Auth-server round trip from every page navigation, the single largest fixed cost.
2. #5 — Move browser-direct classService reads behind cached server routes: collapses the biggest uncached query fan-out and unblocks RLS tightening.
3. #4 — Redis-cache /api/badges (short TTL + invalidation): kills the #1 application query and its polling multiplier.
4. #1 — Set-based rewrite of finalize_exam_reports_atomic: ends multi-minute connection pinning at the highest-contention moment.
5. #19 — Revoke EXECUTE on privileged SECURITY DEFINER RPCs: zero-regression (app uses service role exclusively — verified), closes privilege escalation.
6. #15 / #16 / #17 — Fix USING (true) exposure (pending_registrations first, then exams, then the broad set after #5 lands): critical security, sequenced behind the client-read migration.
7. #29 / #30 / #31 — Fix delete_user, approve-transfer cancellation_reason corruption, LRN-change FK failure: active runtime-failure/data-corruption paths.
8. #18 — Correct the transfer-request policy permission predicate: restores intended admin visibility on client reads.
9. #8 / #9 — Add the two composite indexes: cheap wins on the report-completion hot path.
10. #11 / #12 — Drop duplicate and zero-scan indexes: write-amplification cleanup, lowest urgency.
