-- RA 10173 consent capture (compliance plan, Phase 2).
-- Records a user's acknowledgement of the Privacy Notice as the SYSTEM OF RECORD —
-- stored on users (lifetime of the account), captured first on pending_registrations
-- at signup and carried over to users on confirmation. NOT stored in audit_logs, so
-- the tiered retention purge can never delete the consent evidence.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the code that reads/writes these
-- columns (signup + confirm routes). Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS privacy_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_version text;

ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS privacy_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_version text;

COMMENT ON COLUMN public.users.privacy_consent_at IS
  'When the user consented to the Privacy Notice (RA 10173). Evidence of consent — retained for the lifetime of the account.';
COMMENT ON COLUMN public.users.privacy_consent_version IS
  'Privacy Notice version acknowledged (see lib/privacy.ts PRIVACY_NOTICE_VERSION).';

COMMIT;
