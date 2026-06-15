# ClassCloud Thesis — Codebase Audit Findings
**Purpose:** This document reconciles the thesis paper ("ClassCloud: A Cloud-Based Optical Mark Recognition System for Periodical Reporting at Baliwag North Central School") against the fully completed codebase. Use it to identify what needs to be corrected, added, or removed in the paper.

---

## PART 1 — TECHNOLOGY STACK (Table 1 corrections)

### Inaccuracies — fix these exact values:

| Paper Claims | Correct Value |
|---|---|
| TypeScript `5.9.3` | `^5` (range; exact resolved version not pinned) |
| Next.js `16.1.6` | `^16.2.6` |
| Tailwind CSS `4.1.18` | `^4` (also requires `@tailwindcss/postcss: ^4`) |
| Mantine `8.3.15` | Core: `^8.3.10`; other Mantine packages range `^8.3.10–^8.3.15` |
| Tabler Icons `3.36.1` | `@tabler/icons-react: ^3.44.0` |
| OpenCV.js `4.12.0` | `@techstark/opencv-js: ^4.12.0-release.1` (npm package name differs) |
| Node.js `24.11.1` | Not pinned in repo; write "Node.js 20 LTS" (`@types/node: ^20`) |

### Confirmed correct versions:
React `19.2.1`, Upstash Redis `^1.37.0`, Upstash Ratelimit `^2.0.8`, Cloudflare Turnstile `^1.5.0` (package: `@marsidev/react-turnstile`), jsPDF `^4.2.0`, qrcode `^1.5.4`, xlsx-js-style `^1.2.0`, Zod `^4.3.6`, Resend `^6.10.0`.

### Missing from Table 1 — add these:

| Library | Version | Purpose |
|---|---|---|
| `@supabase/ssr` | `^0.8.0` | Supabase SSR session management for Next.js App Router |
| `jsqr` | `^1.4.0` | QR code **decoding** during OMR scanning (distinct from `qrcode` which only generates) |
| `serwist` / `@serwist/next` | `^9.5.11` | PWA service worker (Workbox-based) |
| `@dnd-kit/core` + `sortable` | `^6.3.1` / `^10.0.0` | Drag-and-drop for exam objective and answer key ordering |
| `dayjs` | `^1.11.21` | Date manipulation |
| `recharts` | `^3.8.1` | Chart rendering (used via Mantine Charts) |
| `@mantine/form` | `^8.3.10` | Form state management |
| `@vercel/analytics` + `@vercel/speed-insights` | `^2.0.1` / `^2.0.0` | Production analytics and Core Web Vitals monitoring |

### Important architectural note for OpenCV:
`@techstark/opencv-js` is served as a static file (`/public/opencv.js`) and injected at runtime via `<script>` tag — it is **not** webpack-bundled due to WASM size constraints. This is architecturally significant and should be mentioned when describing the OMR processing setup.

---

## PART 2 — SYSTEM ARCHITECTURE

### 2a. Directory Structure
The project maps to the four-layer architecture as follows:

- **Presentation Layer:** `app/(app)/` (pages), `components/` (shared UI)
- **Application Layer:** `app/api/` (all API route handlers)
- **Logic Layer:** `lib/` (services, email, Supabase clients, audit, rate-limit, redis, permissions-sync, omrLayout)
- **Data/Integration Layer:** Supabase (PostgreSQL + Auth), Upstash Redis, Resend, Cloudflare Turnstile

**Route groups:**
- `(app)/` — all authenticated pages; shares `AuthProvider + NavBar` layout via `app/(app)/layout.tsx`
- Auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/activate`, `/auth/callback`) are top-level, outside any route group

### 2b. Proxy / Auth Flow (`proxy.ts`)
The middleware file is `proxy.ts`, not `middleware.ts`. Describe it accurately:

- Excluded from interception: `_next/static`, `_next/image`, `favicon.ico`, `api/*`, `logo/*`, `icons/*`, `manifest.webmanifest`, `sw.js`
- **Prefetch optimization:** Requests with `next-router-prefetch: 1` or `sec-purpose: prefetch` bypass auth check entirely
- **Two-tier session validation:**
  1. Fast path: `supabase.auth.getClaims()` — JWKS-local JWT verification, no network round-trip to Auth server
  2. Fallback: `supabase.auth.getUser()` — validates and refreshes expired tokens
- **Route classification:**
  - Always public: `/reset-password`, `/auth/callback`, `/signup/confirmed`, `/invite/activate`
  - Unauthenticated only: `/login`, `/forgot-password`, `/signup`
  - All others: require a valid session
- **Redirect logic:** Unauthenticated → `/login?next=<path>`; authenticated on unauthOnly → `/` (or `?next=` param)
- **No role/permission enforcement at this layer** — proxy only checks session existence

### 2c. RBAC Architecture — Four Layers

The paper must describe all four layers accurately:

**Layer 1 — `ProtectedRoute.tsx` (client-side, UX guard):**
- Reads `user.app_metadata.permissions` from decoded JWT via `useAuth()` (AuthContext)
- Cold-start fallback: `sessionStorage.getItem("cc_permissions")`
- Props: `requiredPermissions: string[]`, `match?: 'any' | 'all'` (default `'any'`)
- On denial: `router.replace("/unauthorized")`
- Shows `<Loader>` while permissions load; supports custom `loadingFallback` prop

**Layer 2 — `proxy.ts` (session-only, no permission check)**

**Layer 3 — API route handlers (authoritative server-side enforcement):**
- Every protected route calls `getServerUser()` (React-cache-wrapped, JWT fast path) then `getPermissionsFromUser(user)` (reads `app_metadata.permissions` — zero DB round-trip)
- Each handler does its own inline `permissions.includes("permission.string")` check
- No shared permission middleware wrapper — checks are per-route
- Faculty (`exams.limited_access`) get an additional scope check: must be assigned to the specific section being operated on
- Write operations use the Supabase **service role admin client**, which bypasses RLS — writes are controlled entirely at the API layer

**Layer 4 — Supabase RLS (database read guard):**

All 24 RLS policies are **SELECT-only** (no INSERT/UPDATE/DELETE RLS policies exist). The full policy list:

| Tables | Enforces |
|---|---|
| `curriculum_subjects`, `curriculums`, `enrollments`, `exam_assignments`, `exam_results_reports`, `exams`, `grade_levels`, `item_analysis_reports`, `permissions`, `quarters`, `role_permissions`, `roles`, `school_years`, `sections`, `students`, `subject_coordinators`, `subject_group_members`, `subject_groups`, `subjects`, `teacher_class_assignments`, `user_roles`, `users` | `is_active_staff()` — only active authenticated staff can SELECT any record |
| `notifications` (SELECT + UPDATE) | `auth.uid() = user_id` — users can only read and update **their own** notifications |
| `section_transfer_requests` (SELECT) | Visible if: you are the requester, OR you are the adviser of the from-section, OR the to-section, OR you have `students.full_access` permission |

`is_active_staff()` is a PostgreSQL function — it blocks deactivated accounts from reading any data even with a valid session token.

**Overall RBAC summary for paper:** Multi-layer enforcement. Layer 1 = UX gating. Layer 3 = authoritative write/read enforcement via JWT claims (no DB round-trip). Layer 4 = database-level read guard ensuring only active staff access data, with row-scoped isolation for notifications and transfer requests.

**All permission strings defined and used in the system:**
`classes.full_access`, `students.full_access`, `students.limited_access`, `curriculum.full_access`, `faculty.full_access`, `school_year.full_access`, `users.full_access`, `roles.full_access`, `exams.full_access`, `exams.limited_access`, `reports.view_all`, `reports.view_assigned`, `reports.monitor_grade_level`, `reports.monitor_subjects`, `announcements.full_access`, `audit_logs.view_all`, `audit_logs.view_own`

**Redis permission caching (Version-Check Polling):**
- Key: `permissions:version:<user_id>` → ms-epoch integer, TTL 30 days
- Written by `syncUserPermissions()` whenever roles/permissions change
- Primary invalidation: Supabase Realtime Broadcast on channel `permissions:<user_id>`, event `invalidated` (debounced 400ms)
- Fallback polling: `GET /api/auth/permissions-version` every `15 minutes` via `usePermissionsSync` hook
- Tab focus: triggers additional poll with up to 5-second random jitter
- On version change: `supabase.auth.refreshSession()` → new JWT with updated `app_metadata.permissions`
- Client-side version stored in `sessionStorage` key `cc_perm_version`

### 2d. Database — Key Additions

**Tables not typically documented but worth including:**
- `report_completion_milestones` — tracks when all sections have finalized reports for a subject, subject group, or school-wide (three `milestone_type` values: `subject`, `subject_group`, `all`)
- `section_transfer_requests` — full PENDING/APPROVED/REJECTED/CANCELLED workflow with `expires_at` (30 days)
- `pending_registrations` and `user_invitations` — two separate registration pathways (self-signup vs. admin invite)
- `announcement_reads` — per-user read tracking for announcements
- `scores.mpl` and `scores.proficiency_level` — MPL percentage and proficiency label stored per student per exam attempt

**PostgreSQL RPC functions (called from application code):**
| Function | Purpose |
|---|---|
| `create_transfer_request` | Creates a section transfer request |
| `approve_transfer_request` | Approves and executes a student section transfer |
| `reject_transfer_request` | Rejects a transfer request |
| `create_score` | Inserts a student score (with exam lock check) |
| `finalize_exam_reports_atomic` | Atomically locks exam (`is_locked = true`) and computes/saves both `exam_results_reports` and `item_analysis_reports`. Parameters: `p_exam_id`, `p_generated_by` |

**Note on `finalize_exam_reports_atomic`:** Item difficulty index computation (and any other per-item statistics) lives inside this RPC — not in TypeScript. The TypeScript layer only stores and displays the computed results.

---

## PART 3 — OMR PROCESSING PIPELINE

### Architecture: entirely client-side
**All OMR processing runs in the browser.** The server never receives raw images. Only the final `responses` JSON (item → chosen letter) is sent to `POST /api/exams/scores/create`. This is an important architectural claim that differentiates the system.

**File roles:**
- `lib/services/omrService.ts` — main thread coordinator
- `public/omr-worker.js` — Web Worker running OpenCV WASM operations off the main thread
- `lib/omrLayout.ts` — single source of truth for all OMR geometry constants (shared by scanner and PDF generator)
- `lib/services/examPdfService.ts` — jsPDF answer sheet generator (the active generator; `lib/pdfGenerator.ts` is a legacy stub, no longer used)

### Algorithm steps (exact):

1. **Prescale:** longest edge downsampled to `MAX_SCAN_PX = 1500`
2. **QR decode (main thread):** `jsqr` library (primary) → `BarcodeDetector` API (fallback). Parses `EXAM:<id>|ITEMS:<n>|CHOICES:<n>` to auto-populate scan config
3. **Transfer to worker:** zero-copy `ArrayBuffer` transfer
4. **Corner marker detection:** grayscale → 9×9 Gaussian blur → `THRESH_BINARY_INV + THRESH_OTSU` → `findContours` with area/aspect/solidity/darkness filters (3 passes with progressive relaxation) → `assignCorners()` mapping candidates to quadrants → fallback to Canny + `approxPolyDP` paper edge detection
5. **Perspective warp:** `cv.getPerspectiveTransform` + `cv.warpPerspective` with `INTER_CUBIC`. Output: `1190 × 1684` px (A4 at `WARP_SCALE = 2`)
6. **Image enhancement:** background estimation + contrast boost via `addWeighted(contrast, 0.55, gray, 0.45, 6, blended)`
7. **Orientation check:** `qrRegionStdDev()` + `layoutOrientationScore()` to detect rotated sheets
8. **Bubble detection:** for each item × choice, sample circular ROI at 65% of bubble radius → compute `rawMean` → normalize against per-item baseline (brightest choice = empty paper) → fill fraction = `max(0, 1 - rawMean / itemBaseline)` → mark answer if `topFill >= 0.04` AND `topFill - secondFill >= 0.02`

**Key constants (from `lib/omrLayout.ts`, in pt, A4 = 595×842 pt):**
- `BUBBLE_R = 6`, `FILL_THRESHOLD = 0.04`, `FILL_DELTA = 0.02`
- `ROW_H = 22`, `CHOICE_SPACING = 25`, `GRID_START_Y = 203`
- `ITEMS_PER_COL = 25`, 2-column layout
- 4 corner markers: 24×24 pt solid black squares at known positions

### QR code:
- **Encoded data:** `EXAM:<exam_id>|ITEMS:<totalItems>|CHOICES:<numChoices>`
- **Generated by:** `qrcode` npm package (`QRCode.toDataURL()`), embedded in PDF at top-right (72×72 pt)
- **Decoded by:** `jsqr` during scanning — result auto-selects the exam and configures the scan

### Answer sheet layout (jsPDF, `examPdfService.ts`):
- A4 portrait (595×842 pt)
- 4 corner markers (24×24 pt solid black) for perspective correction
- QR code top-right (72×72 pt)
- Header: title, exam name, student info lines, instructions box, shading guide
- Bubble grid: starts at y=203, 2 columns (items split at ceil(n/2)), alternating shaded rows
- Footer: Exam ID, total items, generation date, "Prepared by" line

---

## PART 4 — FEATURE COMPLETENESS

| # | Feature | Status |
|---|---|---|
| 1 | Centralized Periodical Test Reports Management | FULLY IMPLEMENTED |
| 2 | Automated Consolidation of Student Test Results | FULLY IMPLEMENTED |
| 3 | Automated Item Analysis, Level of Proficiency, LAEMPL | FULLY IMPLEMENTED (see note on Discrimination Index below) |
| 4 | Examination Creation, Answer Key, Learning Objective Management | FULLY IMPLEMENTED |
| 5 | OMR Answer Sheet Generation and Scanning | FULLY IMPLEMENTED |
| 6 | School Year, Curriculum, Faculty Load, Class, Student Management | FULLY IMPLEMENTED |
| 7 | User, Role, Permission, Access Management (RBAC) | FULLY IMPLEMENTED |
| 8 | Dashboard with Announcements and Notifications | FULLY IMPLEMENTED |
| 9 | Profile and Teaching Load Management | FULLY IMPLEMENTED |
| 10 | Audit Logs for User Activity Monitoring | FULLY IMPLEMENTED (90-day retention via cron job) |
| 11 | Import and Export of Academic Records and Reports | FULLY IMPLEMENTED |
| 12 | Email Verification, Password Recovery, Automated Notifications | FULLY IMPLEMENTED |
| 13 | Secure Web-Based Interface | FULLY IMPLEMENTED |
| 14 | PWA Support | PHASE 1 ONLY — installable shell; Web Push not implemented, not in scope |

---

## PART 5 — ACADEMIC COMPUTATION LOGIC (critical section)

### MPL Formula (confirmed in `app/api/exams/scores/create/route.ts`):
```
MPL% = round((raw_score / total_items) × 100)
MPS  = (class_mean / total_items) × 100
```

### Level of Proficiency — CRITICAL DISCREPANCY

**Implemented labels** (from `reportsAnalysisService.ts`, `scores/create/route.ts`, `exam-result-download/route.ts` — all three consistent):

| MPL Range | System Label |
|---|---|
| ≥ 90 | Highly Proficient |
| 75–89 | Proficient |
| 50–74 | Nearly Proficient |
| 25–49 | Low Proficient |
| < 25 | Not Proficient |

**DepEd Order 8, s. 2015 labels:** Beginning / Developing / Approaching Proficiency / Proficient / Advanced

These do not match. The paper writers have located a separate reference that justifies the implemented taxonomy. This reference must be cited in the paper wherever proficiency levels are discussed. Do not describe the system as following DepEd Order 8, s. 2015 proficiency labels.

### Item Difficulty Index:
`correctResponses` (count of correct answers per item) is stored in `item_analysis_reports.item_scores jsonb`. The ratio computation (correct / n) is performed inside the `finalize_exam_reports_atomic` PostgreSQL RPC — not in TypeScript code. Document accordingly.

### Item Discrimination Index — NOT IMPLEMENTED:
No discrimination index computation exists anywhere in the TypeScript/JavaScript codebase. No `discrimination_index` column in `item_analysis_reports`. The `finalize_exam_reports_atomic` RPC would need to be inspected separately. **Do not claim this is automated in the paper's scope.** Move it to Limitations and Recommendations.

### LAEMPL (from `app/api/reports/exam-result-download/route.ts`):
```
MPL_THRESHOLD = 60
A learner attains LAEMPL if: mpl >= 60
```
Excel label: *"Number of Learners who attained or exceeded the Minimum Proficiency Level (60%)"*

LAEMPL matrix columns: Enrolled / Test Takers / Attained MPL / Percentage — broken down by sex and total.

### Most/Least Learned (from `lib/services/reportsAnalysisService.ts`, `aggregateItemAnalysis()`):
```
Sort: descending by correctResponses; tie-break: ascending by itemNo
Most Learned  = top 10 items from ranked array
Least Learned = bottom 10 items (reverse of ranked array, first 10)
```
- Pre-finalization (single section): computed inside `finalize_exam_reports_atomic` RPC, stored in `item_analysis_reports.most_learned/least_learned jsonb`
- Consolidated view (multi-section): re-aggregated by `aggregateItemAnalysis()` client-side

---

## PART 6 — REPORT GENERATION

### Report types:

**1. Individual Exam Result Report**
- Format: XLSX, landscape, A4
- Scope: per exam + per section
- Columns/sections: exam header, class details, summary statistics (No. of Items, No. of Cases, Total Score, Mean, MPS, Highest/Lowest Score, SD), proficiency table (Name, Score, MPL%, Proficiency Level — sorted by sex), LAEMPL matrix (enrolled/test takers/attained 60% by sex), "Achieved/Failed 60% MPL" tables, Proficiency Level distribution

**2. Consolidated Exam Report**
- Format: XLSX, landscape, A4
- Scope: per subject per grade level (all sections combined), or school-wide
- Structure: same as individual but aggregated

**3. Item Analysis Report**
- Format: in-app view (stored in `item_analysis_reports`)
- Data: item number, learning objective, correct responses count, rank, top 10 most/least learned competencies

**4. Student Roster**
- Format: XLSX download
- Scope: per section

**5. OMR Answer Sheet**
- Format: PDF download
- One sheet per exam, designed for OMR scanning

### Confirmed scopes: per-exam/per-section, per-subject/per-grade, school-wide

### xlsx-js-style usage:
Direct cell manipulation: `ws["A1"] = { v, t, s }` with `s` containing `font`, `fill`, `alignment`, `border` objects. Worksheet properties: `!cols`, `!rows`, `!merges`, `!pageSetup` (landscape, A4), `!margins`, `!protect`.

---

## PART 7 — EMAIL NOTIFICATIONS (complete list, 21 types)

All emails sent from `ClassCloud <noreply@classcloudph.app>` via Resend. Templates are HTML strings (not React Email) using shared layout helpers.

| Email Function | Trigger | Recipient |
|---|---|---|
| `sendVerificationEmail` | Self-signup submitted | Registrant |
| `sendEmailVerifiedEmail` | Email link clicked | Registrant |
| `sendApprovalEmail` | Admin approves registration | Approved user |
| `sendRejectionEmail` | Admin rejects registration | Rejected user |
| `sendWelcomeEmail` | Admin creates user directly | New user |
| `sendInvitationEmail` | Admin sends invitation | Invited user |
| `sendInviteActivatedEmail` | Invite link used | Activated user |
| `sendInviteCancelledEmail` | Admin cancels invite | Invited user |
| `sendAccountDeactivationEmail` | Admin deletes user | Deleted user |
| `sendPasswordResetEmail` | Forgot password request | Account owner |
| `sendTransferRequestCreatedToFromAdviser` | Transfer request created | From-section adviser |
| `sendTransferRequestCreatedToAdmin` | Transfer request created | Admin/reviewer |
| `sendTransferRequestApprovedToRequester` | Transfer approved | Requester |
| `sendTransferRequestApprovedToFromAdviser` | Transfer approved | From-section adviser |
| `sendTransferRequestRejectedToRequester` | Transfer rejected | Requester |
| `sendTransferRequestRejectedToFromAdviser` | Transfer rejected | From-section adviser |
| `sendDirectMoveToFromAdviser` | Admin directly moves student | From-section adviser |
| `sendDirectMoveToToAdviser` | Admin directly moves student | To-section adviser |
| `sendSubjectReportsCompleted` | All sections finalized for a subject | Grade Subject Leader |
| `sendSubjectGroupReportsCompleted` | All sections finalized for a subject group | Subject Coordinator |
| `sendAllReportsCompleted` | All subjects/sections finalized for quarter | Principal / all-access user |

---

## PART 8 — SECURITY

### JWT Custom Claims:
Stored in `app_metadata` (server-writable, not user-modifiable):
- `app_metadata.permissions` — string array of permission names
- `app_metadata.roles` — array of `{ role_id, name }` objects

Set by `syncUserPermissions()` in `lib/permissions-sync.ts` via `adminClient.auth.admin.updateUserById()`. Read on every API request via `getPermissionsFromUser()` — zero DB round-trip after initial sync.

### Rate Limiting (Upstash Redis `Ratelimit.slidingWindow()`):
- `POST /api/auth/forgot-password`: **5 requests / 15-minute window / IP**, key prefix `rl:forgot-password`
- `POST /api/auth/signup`: rate limited (same pattern)
- `POST /api/auth/signup/resend`: rate limited
- `GET /api/auth/check-email`: rate limited
- `GET /api/auth/check-pending`: rate limited
- Falls back to in-process Map on Redis failure

### Cloudflare Turnstile:
Enforced on `POST /api/auth/signup` and `POST /api/auth/forgot-password`. Server-side via `lib/turnstile.ts`. Client widget from `@marsidev/react-turnstile`.

### Honeypot:
`website` hidden field on forgot-password form. If populated → silently return `{ success: true }` and log `honeypot_triggered` to audit logs.

### Audit Logs:
- Table: `audit_logs` — append-only (no `updated_at`/`deleted_at` columns; `created_at` defaults to `now()`)
- 5 categories: `ACCESS`, `SECURITY`, `ACADEMIC`, `ADMIN`, `SYSTEM`
- Stores: `actor_id`, `category`, `action`, `entity_type`, `entity_id`, `entity_label`, `old_values jsonb`, `new_values jsonb`, `metadata jsonb`
- **Retention: 90 days, enforced by a scheduled cron job (automatic deletion of records older than 90 days)**
- Logged events include: login, logout, role/permission changes, exam finalization, rate limit exceeded, Turnstile failures, honeypot triggers, score operations

### Security features to add to the paper that may be missing:
- `must_change_password` forced-change flow: admin-created accounts must change password on first login
- `expires_at` on `pending_registrations` and `section_transfer_requests` (30-day automatic expiry)
- Supabase Auth token revocation on explicit logout
- `active_status` on `users` table blocks deactivated users at the RLS level (`is_active_staff()`)

---

## PART 9 — RA 10173 (DATA PRIVACY ACT) COMPLIANCE

No explicit RA 10173 compliance code was found. The following maps existing system features to the Act's requirements:

### Already satisfied (frame these in the paper):

| RA 10173 Requirement | ClassCloud Implementation |
|---|---|
| Security of Personal Information (Sec. 20) | HTTPS (Vercel), Supabase Auth JWT, RLS, rate limiting, Turnstile, honeypot, audit logs |
| Data minimization | Schema collects only operationally necessary data (LRN, name, sex, scores) |
| Access control / need-to-know | Multi-layer RBAC; `is_active_staff()` RLS gate; row-scoped policies for notifications and transfer requests |
| Audit trail / accountability | `audit_logs` with full category coverage, actor tracking, old/new value capture |
| Data retention policy | Audit logs purged after **90 days** via cron job |
| Account deactivation / removal | `active_status` (suspension) and `deleted_at` (soft delete); permanent deletion via admin hard-delete route |
| Data subject correction | `PUT /api/settings/profile` allows users to correct their own personal data |

### What is missing (acknowledge as limitations or future work):
- No formal Privacy Policy page linked during signup
- No consent acknowledgement checkbox on the signup form
- No self-service data subject request mechanism ("export my data" / "delete my account request")
- No data breach notification workflow

### Suggested paper language:
> "ClassCloud addresses the technical requirements of RA 10173 through layered security controls, role-based access enforcement, append-only audit logging with a 90-day retention policy, and administrative tools for account suspension and permanent deletion. Formal consent management and data subject request workflows are identified as areas for future enhancement."

---

## PART 10 — DEPLOYMENT

### CI/CD:
No `vercel.json` or GitHub Actions workflow files present. Deployment is handled by **Vercel's GitHub integration** — every push to the `main` branch automatically triggers a production build and deployment.

> Write as: "The system employs a continuous deployment pipeline through Vercel's GitHub integration. Every commit pushed to the main branch triggers an automated build and production deployment, with build logs and rollback capabilities available through the Vercel dashboard."

### Environment variables (names, not values):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SITE_URL`, Cloudflare Turnstile secret key

### `next.config.ts` notable settings:
- `experimental.useCache: true` — enables Next.js 16 `"use cache"` directive for server-side data caching
- `experimental.staleTimes: { dynamic: 0, static: 30 }` — dynamic routes bypass stale cache; static routes cache for 30 seconds
- `turbopack: {}` — enables Turbopack for development builds
- OpenCV WASM explicitly excluded from webpack bundling; served from `/public/opencv.js` and injected at runtime

### Build command:
`next build && serwist build serwist.config.mjs` — two-phase build: Next.js first, then service worker compilation

---

## PART 11 — GIT / SPRINT HISTORY

- **Total commits:** 235
- **Date range:** 2025-12-09 → 2026-06-14 (approximately 6 months)
- **Open TODOs in codebase:** Found only in `app/error.tsx`

### Major features not captured in original sprint table:
- PWA Phase 1 (Serwist, service worker, manifest, shortcuts) — 2026-06-14
- Human-readable audit log action presenters + full audit coverage — 2026-06-10
- Database health/performance investigation — 2026-06-08
- Announcements module finalization — 2026-06-02
- Reports visualization + cache overhaul — 2026-06-01
- Dashboard/home page — 2026-05-31
- Section transfer requests (full workflow) — 2026-05-30
- Grade Subject Leader (GSL) integration — 2026-05-27
- Vercel Analytics + Speed Insights — 2026-05-28
- OMR scan camera (5 development iterations) — 2026-05-23
- Faculty masterlist + subject coordinators + grade subject leaders — 2026-05-03
- School year module — 2026-05-16

---

## PART 12 — PWA

**Phase 1 — COMPLETE (include in paper):**
- Service worker via Serwist (`^9.5.11`), compiled as separate post-build step
- Caching strategy: `/api/*` → NetworkOnly, `*.supabase.co` → NetworkOnly, static assets → Serwist defaultCache
- Manifest: `name: "ClassCloud"`, `display: "standalone"`, `theme_color: "#4EAE4A"`, `orientation: "portrait"`
- 3 home screen shortcuts: Classes, Examinations, Reports
- Icons: 192px (any), 512px (any), 512px maskable

**Phase 2 (Web Push) — NOT IMPLEMENTED. Do not include in scope.**

---

## SUMMARY: ITEMS NEEDING PAPER CHANGES

| Priority | Item | Action |
|---|---|---|
| HIGH | Item Discrimination Index | Remove from automated features scope; add to Limitations |
| HIGH | Proficiency level taxonomy | Cite the reference justifying custom labels; do not cite DepEd Order 8 for this |
| HIGH | RBAC description | Expand to cover all 4 layers; document RLS policies accurately |
| HIGH | OMR architecture | Clarify all processing is client-side (browser); describe Web Worker usage |
| MEDIUM | Table 1 versions | Fix all version values listed above |
| MEDIUM | Table 1 missing libraries | Add jsqr, serwist, dnd-kit, dayjs, recharts, @mantine/form, Vercel analytics |
| MEDIUM | Audit log retention | Add "90-day retention enforced by scheduled cron job" |
| MEDIUM | RA 10173 | Use the framing in Part 9; do not overstate compliance; acknowledge gaps |
| MEDIUM | CI/CD | Describe as Vercel GitHub integration (automated on push to main) |
| MEDIUM | PWA | Phase 1 only; remove any Web Push claims |
| LOW | Email notifications | Expand from partial list to all 21 types documented in Part 7 |
| LOW | Node.js version | Change to "Node.js 20 LTS" |
| LOW | `proxy.ts` | Name it correctly as `proxy.ts` not `middleware.ts` |
| LOW | OpenCV serving method | Note it's runtime-injected WASM, not webpack-bundled |
