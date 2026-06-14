# ClassCloud

A centralized quarterly test reporting and school management system for **Baliwag North Central School**. ClassCloud lets faculty and administrators create exams, scan paper answer sheets with a camera (OMR), auto-score them, and generate item-analysis, proficiency, and LAEMPL reports — all on top of a role-based permission system that mirrors the school's organizational structure.

## Tech Stack

| Layer          | Technology                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Turbopack, Cache Components / `useCache`)                            |
| Runtime        | React 19                                                                                     |
| Language       | TypeScript (strict)                                                                          |
| UI             | Mantine v8 (core, charts, dates, form, modals, notifications), Tailwind CSS v4, Tabler Icons |
| Charts         | Mantine Charts + Recharts                                                                    |
| Backend        | Supabase (PostgreSQL + Row-Level Security, RPCs, service-role admin client)                  |
| Auth           | Supabase SSR (`@supabase/ssr`), JWT (asymmetric keys, locally verified)                      |
| Caching        | Upstash Redis + Next.js cache tags + client `sessionStorage`                                 |
| Rate limiting  | Upstash Ratelimit                                                                            |
| Email          | Resend                                                                                       |
| CAPTCHA        | Cloudflare Turnstile                                                                         |
| OMR / scanning | OpenCV.js + jsQR (runtime-injected, Web Worker)                                              |
| Drag & drop    | dnd-kit                                                                                      |
| PDF / export   | jsPDF, xlsx-js-style, qrcode                                                                 |
| Validation     | Zod                                                                                          |
| Analytics      | Vercel Analytics + Speed Insights                                                            |
| Deployment     | Vercel                                                                                       |

## Features

- **Exams** — create, copy, and manage quarterly exams with answer keys and learning objectives; lock/finalize workflow.
- **OMR Scanning** — scan and auto-score paper answer sheets through the device camera using OpenCV.js and QR-coded sheets, processed off the main thread in a Web Worker.
- **Reports** — item analysis, level of proficiency, and LAEMPL reports with a monitoring tree, per-section and per-subject drill-downs, and PDF/Excel export.
- **Classes** — section management, student rosters, bulk student import/export, subject-teacher assignments, and a full transfer-request workflow (request → approve/reject → cancel).
- **Curriculum** — grade-level curriculum and subject management with SSES/Regular subject typing.
- **Faculty** — teaching-load assignment, grade-subject leaders, and subject coordinators.
- **School Year** — academic year and quarter lifecycle (create, toggle active quarter, soft/hard delete).
- **Announcements** — create, schedule, pin, publish, and target announcements with attachments and read tracking.
- **Notifications** — in-app notifications with unread badges and realtime badge sync.
- **Audit Logs** — login and action auditing.
- **User Roles & Permissions** — role-based access control with granular permission strings and realtime permission sync.
- **User Management** — signup approval workflow, email invitations, and forced password changes, all email-driven.

## Architecture

ClassCloud is a single Next.js App Router application split into two route groups:

- **`app/(app)/`** — authenticated pages (dashboard, exams, reports, school management, settings). Wrapped by `AuthContext`, which composes session, permissions, and realtime permission-sync hooks.
- **Public auth routes** — `login`, `signup`, `forgot-password`, `reset-password`, `invite/activate`, and the `auth` callback.

**Authentication & routing.** `proxy.ts` (Next.js proxy/middleware) guards every non-API route. It verifies the JWT **locally** via `getClaims()` against cached JWKS (no Auth-server round-trip on the happy path), falling back to `getUser()` only to refresh expired tokens. Prefetch requests skip auth work entirely to avoid poisoning the router cache.

**Data access.** Server routes under `app/api/` use a Supabase service-role admin client and call PostgreSQL RPCs (see `RPCs.txt`); client code uses the anon/publishable key with RLS enforced (see `RLSPolicies.txt`). PostgREST FK hints follow the `table!fk_column` convention.

**Caching.** A multi-layer strategy combines Upstash Redis (centralized keys in `lib/cache-keys.ts`, with TTLs), Next.js cache tags (`lib/cache-tags.ts` + `useCache`), and client-side `sessionStorage` for permissions/roles. Service modules in `lib/services/*` own read paths and invalidation.

**OMR pipeline.** `opencv.js` is served from `/public` and injected at runtime via a `<script>` tag in `omrService.ts` (never bundled). Sheet processing runs in `public/omr-worker.js` to keep the UI responsive.

## Project Structure

```
app/
  (app)/              Authenticated pages
    page.tsx          Dashboard / home
    exam/             Exam create, view, scan
    reports/          Item analysis & proficiency reports (per section / per subject)
    school/           classes, curriculum, faculty, year
    announcements/    Create, schedule, edit
    user-roles/       Roles & users management
    audit-logs/ settings/ account/ unauthorized/
  api/                Route handlers (auth, classes, exams, reports, faculty, users, …)
  login/ signup/ forgot-password/ reset-password/ invite/ auth/   Public auth routes
components/           Shared UI (NavBar, wizards, modals, login, notifications)
context/              AuthContext
hooks/                Permissions, badge sync, Supabase session hooks
lib/
  services/           Client + server service layer (per domain)
  supabase/           Browser / server / admin clients, env, middleware helpers
  email/              Resend transporter + templates
  cache-keys.ts cache-tags.ts redis.ts rate-limit.ts audit.ts notifications.ts …
types/                Generated database types
supabase/             Supabase project config
public/               opencv.js, omr-worker.js, logos, icons
proxy.ts              Auth proxy (middleware)
```

## Data Model

The PostgreSQL schema centers on the academic hierarchy and reporting pipeline. Key tables include:

- **Academics:** `school_years`, `quarters`, `grade_levels`, `sections`, `subjects`, `curriculums`, `curriculum_subjects`, `subject_groups`, `subject_group_members`
- **People & enrollment:** `users`, `students`, `enrollments`, `teacher_class_assignments`, `section_transfer_requests`
- **Exams & scoring:** `exams`, `exam_assignments`, `scores`, `exam_results_reports`, `item_analysis_reports`, `report_completion_milestones`
- **Faculty roles:** `subject_coordinators`, `grade_subject_leaders`
- **Access control:** `roles`, `permissions`, `role_permissions`, `user_roles`
- **Onboarding:** `pending_registrations`, `user_invitations`
- **Engagement:** `announcements` (+ `announcement_targets`, `announcement_attachments`, `announcement_reads`), `notifications`, `audit_logs`

## Deployment

ClassCloud is built for Vercel. Push to the connected branch and configure the same environment variables in the Vercel project settings. Vercel Analytics and Speed Insights are wired into the root layout.
