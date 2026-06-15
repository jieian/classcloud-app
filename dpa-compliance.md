# ClassCloud — Data Privacy Act of 2012 (RA 10173) Compliance

**Personal Information Controller (PIC):** Baliwag North Central School
**System:** ClassCloud (cloud-based OMR periodical-reporting system)
**Last updated:** 2026-06-15

This document maps each obligation under the **Data Privacy Act of 2012 (RA 10173)**, its IRR, and
applicable **NPC Circulars** to the concrete control in ClassCloud, with file references. It
supersedes Part 9 of `thesis-audit-findings.md`. Status legend: ✅ implemented · ◑ partial ·
☐ governance/future work.

---

## 1. Scope of personal data (Sec. 3, 11 — minimization & proportionality)

ClassCloud processes a deliberately minimal set:

| Subject | Data | Sensitive PII? |
|---|---|---|
| Students (minors) | LRN, name, sex, exam scores | No |
| Staff/faculty | name, email, roles | No |
| Activity | audit logs (actor, action, entity, old/new values) | No |

The learner data is an **SF1 (School Form 1 — School Register) subset**. ClassCloud intentionally
**omits SF1's sensitive fields** — religion, address, parents' names, disability/health remarks — and
collects **no sensitive personal information** as enumerated in Sec. 3(l). This is a primary
proportionality strength. Schema: `DatabaseSchema.txt` (`students`, `users`, `enrollments`, `scores`).

---

## 2. Security measures (Sec. 20, NPC Circular 2023-06) — ✅

| Control | Implementation | Where |
|---|---|---|
| Encryption in transit | HTTPS (Vercel) | platform |
| Encryption (pending-signup secrets) | AES-256-GCM | `lib/crypto.ts` |
| Access control / need-to-know | 4-layer RBAC; permission strings in JWT `app_metadata` | `lib/supabase/server.ts`, `components/ProtectedRoute.tsx` |
| **Database read guard** | `is_active_staff()` floor on every read table; `scores`/`audit_logs`/`pending_registrations` service-role-only | live RLS — verified `RLSPolicies.txt` (2026-06-15) |
| Append-only audit logging | `audit_logs`, 5 categories | `lib/audit.ts` |
| Rate limiting | Upstash sliding window on auth routes | `lib/rate-limit.ts` |
| Bot/abuse protection | Cloudflare Turnstile + honeypot | `lib/turnstile.ts`, `app/api/auth/signup/route.ts` |
| Forced password change | admin-created accounts must reset on first login | `app/(app)/_components/MustChangePasswordModal.tsx` |

**RLS PII hardening (compliance-plan Phase 0) — confirmed applied:** the previously-flagged broad
`USING (true)` read exposure (`DatabaseAuditPlan.md` #15/#16/#17/#18/#20) is closed in the live
database. An unapproved, freshly-signed-up account (`active_status = 0`) reads **nothing** from
`students`, `scores`, or `pending_registrations`. The one item not verifiable from file dumps —
revocation of `EXECUTE` on privileged SECURITY DEFINER RPCs (#19) — should be confirmed with the
query recorded in `DatabaseAuditPlan.md`'s Progress section before being claimed.

---

## 3. Transparency & right to be informed (Sec. 16) — ✅

A public **Privacy Notice** is published at `/privacy` (reachable pre-authentication) and linked from
the login and signup pages.

- Page: `app/privacy/page.tsx` · content source of truth: `lib/privacy.ts`
- Public-route allowance: `proxy.ts` (`/privacy` in `alwaysPublicPaths`)
- Covers: PIC identity & DPO contact, data collected, purpose & legal basis, security, sub-processors
  with cross-border transfer, retention schedule, data-subject rights, and NPC complaint route.

---

## 4. Consent (Sec. 12) — ✅ (self-signup)

Self-registration requires explicit, recorded acknowledgement of the Privacy Notice.

- UI: required checkbox linking to `/privacy`; submit blocked until checked — `app/signup/page.tsx`
- Server enforcement (not just UX): rejects signup without `privacy_consent === true` —
  `app/api/auth/signup/route.ts`
- **Consent is the system of record, not an audit entry:** stored as `privacy_consent_at` /
  `privacy_consent_version` columns, captured on `pending_registrations` at signup and carried to
  `users` on confirmation — so it survives for the **lifetime of the account** and is never subject
  to audit-log retention purges. Migration: `supabase/migrations/20260615000000_privacy_consent_columns.sql`;
  carry-over: `app/api/auth/signup/confirm/route.ts`.
- **Minors:** student data is entered by staff, not learners; consent for learner processing is
  obtained by the school through enrolment under its educational mandate (the Notice states this).
- ☐ *Future:* admin-created and invited accounts do not pass through this checkbox; capture consent on
  their first login.

---

## 5. Data-subject rights (Sec. 16–18) — ◑

| Right | Status | Where |
|---|---|---|
| To be informed | ✅ | `/privacy` |
| Access | ◑ | own profile (`GET /api/settings/profile`); self-service export is plan Phase 3 (not in this batch) |
| Rectification | ✅ (name) | `PATCH /api/settings/profile`; student LRN/sex corrected by staff |
| Erasure/blocking | ◑ | admin-mediated via `soft_delete_user_atomic` (bans auth — no ghost account); self-service request is plan Phase 3 |
| Data portability | ☐ | plan Phase 3 (`GET /api/settings/data-export`) |
| Complaint | ✅ | DPO + NPC contact in the Notice |

---

## 6. Accountability — read-access trail (Sec. 20) — ✅

Exports of student PII now write an `ACCESS`-category audit record (actor, entity, timestamp):

- `roster_exported` — `app/api/classes/[sectionId]/students/download/route.ts`
- `exam_report_exported` — `app/api/reports/exam-result-download/route.ts`
- `consolidated_report_exported` — `app/api/reports/consolidated-exam-download/route.ts`
- Action keys + category contract: `lib/audit.ts` (logged on export, not per-view, to bound volume).

---

## 7. Retention

The Privacy Notice publishes the schedule (`lib/privacy.ts` → `RETENTION_SCHEDULE`):

| Record | Period | Basis |
|---|---|---|
| Security & access audit logs | 12 months | NPC Circular 2023-06 (security logs kept longer than system logs); 12-month industry baseline |
| Operational activity audit logs | 90 days | Sec. 11 proportionality (operational only) |
| Consent records | Lifetime of the account | evidence of consent |
| Student/academic records | Per the school's NAP-approved Records Disposition Schedule | confirm with school records officer (DepEd Order No. 4, s. 2014 defines SF *structure*, not retention) |

◑ *Implementation note:* the live audit-log purge is currently a flat 90-day cron. Tiered retention +
incident legal-hold (`legal_hold_until`) is **plan Phase 5b — not implemented in this batch.**

---

## 8. Governance — ☐ (organizational, tracked for the school)

Required by RA 10173 but outside code:

- **Designate a DPO** (Sec. 21) and publish real contact details (replace the placeholder in `lib/privacy.ts`).
- **NPC registration** of the data processing system (likely ≥1,000 data subjects).
- **Sub-processor / outsourcing agreements** (NPC Circular 16-02) with Supabase, Vercel, Resend,
  Upstash, Cloudflare; document **cross-border transfer** safeguards.
- **Breach notification SOP** (NPC Circular 16-03): 72-hour notification to NPC + affected subjects.
- **Privacy Impact Assessment (PIA)** and the **records disposition schedule** confirmation.

---

## Summary of what shipped in this batch

| Phase | Outcome |
|---|---|
| 0 | RLS PII hardening **confirmed applied** (live `RLSPolicies.txt`); docs reconciled |
| 1 | Privacy Notice page + links (login/signup) |
| 2 | Consent capture at signup (UI + server + lifetime columns) |
| 5 | Read-access audit on the three PII export routes |
| 6 | This document |

Not in this batch (see the compliance plan): Phase 3 (data-subject rights UI), Phase 4 (security
headers), Phase 5b (tiered retention + legal hold), Phase 6 governance artifacts.
