/**
 * Single source of truth for the Privacy Notice (RA 10173 — Data Privacy Act of 2012).
 *
 * PRIVACY_NOTICE_VERSION is stamped onto a user's consent record at signup
 * (pending_registrations → users.privacy_consent_version). Bump it whenever the
 * substance of the notice below changes so existing users can be re-prompted to
 * re-consent. Use an ISO date; it sorts and reads cleanly.
 */
export const PRIVACY_NOTICE_VERSION = "2026-06-15";

/** Third parties that process personal data on the school's behalf (sub-processors). */
export const SUB_PROCESSORS = [
  { name: "Supabase", purpose: "Database, authentication & file storage", region: "Outside the Philippines" },
  { name: "Vercel", purpose: "Application hosting & web analytics", region: "Outside the Philippines" },
  { name: "Resend", purpose: "Transactional email delivery", region: "Outside the Philippines" },
  { name: "Upstash", purpose: "Rate-limiting & caching (Redis)", region: "Outside the Philippines" },
  { name: "Cloudflare", purpose: "Bot/abuse protection (Turnstile)", region: "Outside the Philippines" },
] as const;

/** Data retention schedule surfaced in the notice (see Phase 5b of the compliance plan). */
export const RETENTION_SCHEDULE = [
  { record: "Security & access audit logs", period: "12 months" },
  { record: "Operational activity audit logs", period: "90 days" },
  { record: "Consent records", period: "Lifetime of the account" },
  { record: "Student & academic records", period: "Per the school's NAP-approved records disposition schedule" },
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
