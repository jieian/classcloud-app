# ClassCloud — Data Privacy Act of 2012 (RA 10173) Compliance

**Personal Information Controller (PIC):** Baliwag North Central School
**System:** ClassCloud (cloud-based OMR periodical-reporting system)
**Last updated:** 2026-06-20

This document maps each obligation under the **Data Privacy Act of 2012 (RA 10173)**, its IRR, and
applicable **NPC Circulars** to the concrete control in ClassCloud, with file references. It
supersedes Part 9 of `thesis-audit-findings.md`. Status legend: ✅ implemented · ◑ partial ·
☐ governance/future work.

---

## 1. Scope of personal data (Sec. 3, 11 — minimization & proportionality)

ClassCloud processes a deliberately minimal set:

| Subject | Data | Sensitive PII? |
|---|---|---|
| Students (minors) | LRN, name, sex, exam scores | Yes — processed under Sec. 13(b) |
| Staff/faculty | name, email, roles | No |
| Activity | audit logs (actor, action, entity, old/new values) | No |

The learner data is an **SF1 (School Form 1 — School Register) subset**. ClassCloud intentionally
**omits SF1's clearly-sensitive fields** — religion, address, parents' names, disability/health remarks.

**Sensitive personal information (Sec. 3(l)).** Two processed items **are** SPI: (1) **exam/periodical
scores** as "education" data under **Sec. 3(l)(2)** ("…health, education, genetic or sexual life…"); and
(2) the **LRN** as an identifier "issued by government agencies peculiar to an individual" under
**Sec. 3(l)(3)**. The School processes both under **Sec. 13(b)** (processing provided for by existing
laws/regulations — the DepEd record-keeping mandate) and applies the safeguards in §2. The Notice states
this plainly (it does not claim "no SPI") and otherwise minimizes SPI by omitting SF1's other sensitive
fields. ☐ *Governance (optional):* an **NPC advisory opinion** may be obtained to confirm the
classification, but is not a blocker. Schema: `DatabaseSchema.txt` (`students`, `users`, `enrollments`,
`scores`).

---

## 2. Security measures (Sec. 20, NPC Circular 2023-06) — ✅

These safeguards also discharge ClassCloud's duty as a PIP under **Sec. 14** — where a PIC subcontracts
processing, the processor "shall comply with all the requirements of this Act" — so the RLS and encryption
controls below are not merely best practice but the statutory basis on which the School may outsource
processing to ClassCloud.

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
- Covers (17 numbered sections + contents): PIC/PIP identity & DPO contact, Sec. 3 key definitions,
  data collected (per-subject table) & data minimization, no sensitive PII (Sec. 13), purposes,
  lawful basis (Sec. 11 principles + Sec. 12(a)/(c)/(e) criteria), learners/minors, sub-processors
  with cross-border transfer & Sec. 21 accountability, retention schedule with basis, security
  (Sec. 20), breach notification (Sec. 20(f) / NPC Circular 16-03, 72h commitment), cookies &
  analytics, no solely-automated decision-making, data-subject rights table (Sec. 16 & 18),
  how to exercise rights, NPC complaint route (NPC Circular 2021-01), and versioning/changes.

---

## 4. Consent (Sec. 12) — ✅ (self-signup)

Staff consent rests on **Sec. 12(a)** (consent for *personal information*): a staff member's name,
email, and authentication data are regular personal information, not SPI. Sec. 13(a) (consent for
*sensitive* personal information) is **not** the basis for staff accounts — it would apply only if staff
data were SPI, which it is not. (Any thesis text citing 13(a) for the staff signup checkbox should be
aligned to 12(a).)

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
- **Invited / admin-created accounts — ✅ now captured at activation.** The invite-activation screen
  (`app/invite/activate/page.tsx`) requires a Privacy Notice checkbox before the "Log In" button is
  enabled; clicking it activates the account **and** stamps consent in one transaction
  (`activate_user_atomic` now takes `p_privacy_consent_version`; version injected server-side in
  `app/api/users/activate-invite/route.ts`). Validation moved to `app/api/users/validate-invite/route.ts`
  so the link click no longer activates before consent — there is no active-but-unconsented account.
- **Re-consent on a version bump — ✅ wired.** When a user's stored `privacy_consent_version` is NULL
  (legacy/pre-feature accounts) or older than `PRIVACY_NOTICE_VERSION`, a blocking modal
  (`app/(app)/_components/PrivacyReconsentModal.tsx`, mounted in `app/(app)/layout.tsx`) requires
  re-acknowledgement before continuing. Detection runs at most once per session (no per-navigation
  queries). Write path: `POST /api/settings/privacy-consent` → SECURITY DEFINER RPC
  `acknowledge_privacy_notice` (auth.uid()-scoped; `users` has no client UPDATE policy).

---

## 5. Data-subject rights (Sec. 16–18) — ◑

| Right | Status | Where |
|---|---|---|
| To be informed | ✅ | `/privacy` |
| Access | ◑ | own profile (`GET /api/settings/profile`); self-service export is plan Phase 3 (not in this batch) |
| Rectification | ✅ (name) | `PATCH /api/settings/profile`; student LRN/sex corrected by staff |
| Erasure/blocking | ✅ (admin-mediated) | **true, irreversible erasure** via `erase_user_atomic` + auth scrub — see note below; self-service request is plan Phase 3 |
| Data portability | ☐ | plan Phase 3 (`GET /api/settings/data-export`) |
| Complaint | ✅ | DPO + NPC contact in the Notice |

**Erasure is a true PII scrub, not a deactivation.** Deleting a user runs `erase_user_atomic`
(`app/api/users/delete-auth/route.ts`), which scrubs the name in `public.users` to `[deleted]`, nulls
`middle_name` and the consent columns, and tears down all assignments/roles — while the route scrubs
`auth.users` **and** `auth.identities` (email → `deleted-<uid>@deleted.invalid`, password randomized, metadata
cleared, account banned). Only the `uid` (+ `created_at`) is retained as a **tombstone**, because ~19 tables
FK into `public.users(uid)` (notably `audit_logs.actor_id`) — deleting the row would break the accountability
trail, so the row is kept but emptied of personal data. Erasure is **irreversible**: `check_email_status` no
longer returns `'deleted'`, so a returning person is onboarded as a brand-new account (restore-by-email was
removed). A one-time backfill (`scripts/backfill-erase-deleted-users.mjs`) applies the same scrub to accounts
deleted before this change.

**DSAR after erasure.** For an erased data subject we hold **no personal data** beyond the anonymous `uid`
tombstone and historical `audit_logs` entries retained under the security/accountability basis for their
retention window (see §7). The correct response to an access request is to state exactly this.

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
| Security & access audit logs | 12 months | NPC Circular 2023-06, Sec. 29 (Logs Retention) — security/access logs kept longer than operational logs; 12-month industry baseline |
| Operational activity audit logs | 90 days | Sec. 11 proportionality (operational only) |
| Consent records | Lifetime of the account | evidence of consent |
| Student/academic records | Per the school's NAP-approved Records Disposition Schedule | confirm with school records officer (DepEd Order No. 4, s. 2014 defines SF *structure*, not retention) |

✅ *Implementation — tiered retention enforced.* The purge is **category-aware**, not a flat 90 days:
`SECURITY` and `ACCESS` rows are kept **365 days**; `ACADEMIC`/`ADMIN`/`SYSTEM` (operational activity) **90
days**. Enforced by `public.prune_audit_logs()` (migration `20260624010000_audit_log_tiered_retention.sql`) —
the single source of truth for the periods (the purge runs in-DB via cron, so app code holds no enforcement
copy; the periods are documented in `lib/audit.ts` and stated for data subjects in `lib/privacy.ts`). The existing daily
`prune-old-records` cron job already delegates its audit-log portion to this function (its `notifications`
cleanup is unchanged), so no schedule change was needed — see `supabase/RUNBOOK_audit_retention_cron.md`. **Incident legal hold:** a row with
`audit_logs.legal_hold_until` set in the future is retained past its tier until the timestamp passes
(self-releasing), satisfying NPC Circular 2023-06's requirement to keep incident-related logs as long as the
investigation requires. Consent evidence is unaffected — it lives in `users` columns, never in `audit_logs`.

*Note on the erasure event:* the `user_deleted` audit row is category `ADMIN` → 90-day retention. The
**permanent** record of an erasure is the scrubbed tombstone row itself (`deleted_at` + `[deleted]` name,
retained for the account's lifetime), not the admin-action log; the 90-day `ADMIN` log merely records which
admin performed it.

*Processor logs:* a deletion sends a deactivation email whose body contains the data subject's first name;
that content may persist in the email sub-processor's (Resend) delivery logs under its own retention policy,
covered by the sub-processor agreement (§8) — outside this codebase but acknowledged here for completeness.

---

## 8. Governance — ☐ (organizational, tracked for the school)

These obligations are **organizational, not code** — RA 10173 places them on the School as PIC. The system
supports each one technically; what remains is the School's documented policy and registration. Each item
below states the requirement, ClassCloud's current technical support for it, and the action owner.

### 8.1 Data Protection Officer (Sec. 21, NPC Circular 2016-01)
The PIC must designate a DPO accountable for compliance and publish their contact. The Privacy Notice already
renders a DPO contact block from `lib/privacy.ts → DPO_CONTACT`; it currently holds a **placeholder email**
(`classcloud.team@gmail.com`). **Action (School):** appoint a DPO, register them with the NPC, and replace the
placeholder with the official name/email so the public Notice and DSAR channel point to a real person.

### 8.2 NPC registration of the data processing system (NPC Circular 2017-01)
A PIC processing the personal data of **≥1,000 individuals** (a school roster easily exceeds this) must
register its Data Processing System (DPS) with the NPC and renew annually. **Action (School):** file the DPS
registration via the NPC portal, listing ClassCloud and its sub-processors (§8.4) and the DPO (§8.1).

### 8.3 Privacy Impact Assessment (PIA) (NPC Advisory 2017-03)
A PIA documents the data flows, risks, and controls for the system. Much of the substance already exists: this
document (control mapping), the data-flow/RLS posture (§2), and the minimization analysis (§1) are the core of
a PIA. **Action (School/thesis):** assemble these into a formal PIA record, review it on material change, and
keep it on file for NPC inspection.

### 8.4 Sub-processor / outsourcing agreements + cross-border transfer (Sec. 14; NPC Circular 2016-02)
The PIC remains accountable for personal data handed to processors and must bind them by contract and ensure
comparable protection for **cross-border** transfers. ClassCloud's sub-processors — **Supabase, Vercel,
Resend, Upstash, Cloudflare** — all process **outside the Philippines** and are disclosed in §6 of the public
Notice. **Action (School):** execute/retain each provider's Data Processing Agreement (all publish a standard
DPA) and record the transfer safeguards (the providers' DPAs + recognized security/privacy certifications)
in the PIA.

### 8.5 Personal data breach notification SOP (Sec. 20(f); IRR Rule IX §38; NPC Circular 2016-03)
Where a breach of sensitive personal information (or info enabling identity fraud) likely poses a real risk of
serious harm, the PIC must notify the **NPC and affected data subjects within 72 hours** of knowledge. The
Notice commits to this (§11) and the system provides the evidentiary substrate — the append-only `audit_logs`
with security/access events retained 12 months (§7) and the self-releasing incident **legal hold**
(`legal_hold_until`) to preserve relevant logs beyond their tier during an investigation. **Action (School):**
adopt a written SOP defining the **detection → assessment → 72-hour notification** flow, naming the DPO as the
coordinator and the audit log + legal hold as the investigation tools.

### 8.6 Records retention & disposition schedule for student records
ClassCloud stores an **SF1 (School Register) subset**; it is **not** the official Form 137/SF10 system of
record. Retention/disposal of these government records is governed by the School's **NAP-approved Records
Disposition Schedule** (National Archives of the Philippines), **not** DepEd Order No. 4, s. 2014 (which
defines SF *structure*, not retention). **Action (School records officer):** confirm the applicable NAP
schedule and record the exact student-record retention period; the Notice currently uses the honest fallback
"per the school's NAP-approved Records Disposition Schedule" until confirmed.

---

## Summary of what shipped in this batch

| Phase | Outcome |
|---|---|
| 0 | RLS PII hardening **confirmed applied** (live `RLSPolicies.txt`); docs reconciled |
| 1 | Privacy Notice page + links (login/signup) |
| 2 | Consent capture at signup (UI + server + lifetime columns) + re-consent on version bump / legacy / invited |
| 5 | Read-access audit on the three PII export routes |
| 5b | **Tiered audit-log retention** (category-aware `prune_audit_logs()` + `legal_hold_until` self-releasing hold) |
| 6 | This document — incl. expanded governance write-up (§8) for the school/thesis |
| — | **True erasure** of users (PII scrub in `auth.users` + `auth.identities` + `public.users`; uid tombstone; restore-by-email removed) — §5 |

Not in this batch (see the compliance plan): Phase 3 (data-subject rights UI — self-service export +
deletion request), Phase 4 (security headers). Phase 6 governance items remain **organizational actions
for the school** (DPO appointment, NPC/DPS registration, sub-processor DPAs, breach SOP, NAP retention
confirmation) — documented in §8, executed off-code.
