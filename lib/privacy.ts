/**
 * Single source of truth for the Privacy Notice (RA 10173 — Data Privacy Act of 2012).
 *
 * PRIVACY_NOTICE_VERSION is stamped onto a user's consent record at signup
 * (pending_registrations → users.privacy_consent_version). Bump it whenever the
 * substance of the notice below changes so existing users can be re-prompted to
 * re-consent. Use an ISO date; it sorts and reads cleanly.
 */
export const PRIVACY_NOTICE_VERSION = "2026-06-20";

/** Human-readable effective date shown in the notice header (kept in sync with the version). */
export const PRIVACY_NOTICE_EFFECTIVE_DATE = "20 June 2026";

/**
 * Key terms reproduced (in plain language) from Section 3 of RA 10173 so the
 * notice is self-contained for a lay reader, per the transparency principle (Sec. 11).
 */
export const KEY_DEFINITIONS = [
  {
    term: "Personal information",
    basis: "Sec. 3(g)",
    meaning:
      "Any information, whether recorded in a material form or not, from which the identity of an individual is apparent or can be reasonably and directly ascertained, or when put together with other information would directly and certainly identify an individual.",
  },
  {
    term: "Sensitive personal information",
    basis: "Sec. 3(l)",
    meaning:
      "A protected sub-category of personal information — including data about an individual's race, ethnic origin, marital status, age, color, and religious, philosophical or political affiliations; health, education, genetic or sexual life; any proceeding for an offense committed or alleged; and identifiers issued by government agencies peculiar to an individual.",
  },
  {
    term: "Processing",
    basis: "Sec. 3(j)",
    meaning:
      "Any operation performed upon personal data, including its collection, recording, organization, storage, updating, retrieval, consultation, use, consolidation, blocking, erasure, or destruction.",
  },
  {
    term: "Data subject",
    basis: "Sec. 3(c)",
    meaning: "The individual whose personal information is processed — for ClassCloud, a learner or a member of staff.",
  },
  {
    term: "Personal Information Controller (PIC)",
    basis: "Sec. 3(h)",
    meaning:
      "The person or organization that controls the collection, holding, processing, or use of personal information. The School is the PIC.",
  },
  {
    term: "Personal Information Processor (PIP)",
    basis: "Sec. 3(i)",
    meaning:
      "A person or organization to whom a PIC may outsource the processing of personal data. ClassCloud and its sub-processors act as PIPs on the School's behalf.",
  },
] as const;

/** Categories of personal data processed, with the data subjects they relate to and the source of collection. */
export const DATA_CATEGORIES = [
  {
    subject: "Students (learners)",
    data: "Learner Reference Number (LRN), full name, sex, and periodical assessment scores.",
    source: "Entered by authorized school staff from the school's enrolment records (an SF1 subset).",
  },
  {
    subject: "Staff & faculty",
    data: "Full name, school-issued or approved email address, assigned roles and permissions, and account-security data (e.g., hashed credentials and authentication metadata held by our authentication provider).",
    source: "Provided by the staff member at self-registration, or created by a school administrator.",
  },
  {
    subject: "All users",
    data: "Audit and activity records (actor, action, affected record, timestamp, and before/after values), and limited technical data such as session identifiers and aggregate usage analytics.",
    source: "Generated automatically by the system during use.",
  },
] as const;

/**
 * Purposes for which personal data is processed, each tied to its legal basis under Sec. 12.
 * Kept short; the prose in the notice elaborates.
 */
export const PROCESSING_PURPOSES = [
  "Managing classes, sections, and learner enrolment.",
  "Generating periodical test reports, consolidated reports, and item analysis for teachers and administrators.",
  "Creating and administering user accounts and their roles and permissions.",
  "Maintaining security, preventing abuse, and keeping an accountability trail of access to learner records.",
  "Complying with the School's reporting and record-keeping obligations to the Department of Education (DepEd).",
] as const;

/** Third parties that process personal data on the school's behalf (sub-processors / PIPs). */
export const SUB_PROCESSORS = [
  { name: "Supabase", purpose: "Database, authentication & file storage", region: "Outside the Philippines" },
  { name: "Vercel", purpose: "Application hosting & privacy-friendly web analytics", region: "Outside the Philippines" },
  { name: "Resend", purpose: "Transactional email delivery", region: "Outside the Philippines" },
  { name: "Upstash", purpose: "Rate-limiting & caching (Redis)", region: "Outside the Philippines" },
  { name: "Cloudflare", purpose: "Bot & abuse protection (Turnstile)", region: "Outside the Philippines" },
] as const;

/** Data retention schedule surfaced in the notice, each with its basis (Sec. 11 proportionality). */
export const RETENTION_SCHEDULE = [
  {
    record: "Security & access audit logs",
    period: "12 months",
    basis: "School-set security baseline; under NPC Circular No. 2023-06, Section 29 (Logs Retention), security/access logs are retained longer than operational logs.",
  },
  {
    record: "Operational activity audit logs",
    period: "90 days",
    basis: "Kept only as long as operationally necessary (Sec. 11 — proportionality).",
  },
  {
    record: "Consent records",
    period: "Lifetime of the account",
    basis: "Retained as evidence of lawful processing (Sec. 12).",
  },
  {
    record: "Student & academic records",
    period: "Per the school's NAP-approved Records Disposition Schedule",
    basis: "Governed by the School's records-retention obligations as a public school.",
  },
] as const;

/**
 * Data-subject rights under RA 10173, each with its statutory basis, for the rights table.
 * Sections 16 and 18 of the Act; the right to object is recognized in the IRR (Rule VIII).
 */
export const DATA_SUBJECT_RIGHTS = [
  {
    right: "Right to be informed",
    basis: "Sec. 16(a)–(b)",
    description:
      "To know whether your personal data is being processed, and to be told — before or at collection — the purpose, scope, recipients, retention period, and your rights.",
  },
  {
    right: "Right to access",
    basis: "Sec. 16(c)",
    description:
      "To obtain, upon demand, the contents of your personal data, its sources and recipients, and the manner and reasons for any disclosure.",
  },
  {
    right: "Right to object",
    basis: "IRR Rule VIII, §34(b)",
    description:
      "To object to the processing of your personal data, including processing for a purpose other than that for which it was collected.",
  },
  {
    right: "Right to rectification",
    basis: "Sec. 16(d)",
    description: "To dispute and have corrected, without delay, any inaccurate or erroneous personal data.",
  },
  {
    right: "Right to erasure or blocking",
    basis: "Sec. 16(e)",
    description:
      "To suspend, withdraw, or order the blocking, removal, or destruction of personal data that is incomplete, outdated, false, unlawfully obtained, or no longer necessary.",
  },
  {
    right: "Right to data portability",
    basis: "Sec. 18",
    description:
      "To obtain a copy of personal data processed by electronic means in a structured, commonly used, machine-readable format.",
  },
  {
    right: "Right to damages",
    basis: "Sec. 16(f)",
    description:
      "To be indemnified for damages sustained due to inaccurate, incomplete, outdated, false, or unlawfully obtained or processed personal data.",
  },
  {
    right: "Right to file a complaint",
    basis: "RA 10173; NPC",
    description: "To lodge a complaint with the National Privacy Commission regarding the processing of your data.",
  },
] as const;

/**
 * Contact point for data subject requests and complaints. Replace placeholders
 * with the school's designated Data Protection Officer (DPO) details before
 * publishing — tracked as a governance item (Phase 6).
 */
export const DPO_CONTACT = {
  role: "Data Protection Officer",
  organization: "Baliwag North Central School",
  email: "classcloud.team@gmail.com", // TODO(governance): replace with the school DPO email
} as const;
