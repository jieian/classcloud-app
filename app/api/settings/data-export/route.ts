import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { createRateLimiter } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";
import { getUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { after } from "next/server";

// RA 10173 Sec. 16 (access) + Sec. 18 (portability): a signed-in user downloads all
// personal data the system holds about them, as a single machine-readable JSON file.

// Per-uid throttle — a full personal-data dump is a scraping target. Redis-backed
// (shared across instances); degrades to per-instance in-process only if Redis is down.
const exportLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 3_600_000, // 1 hour
  prefix: "data-export",
});

const ACTIVITY_CAP = 2000;

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const user = await getAuthUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await exportLimiter.check(user.id);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many export requests. Please try again later." },
      { status: 429 },
    );
  }

  // ── 1. Profile + account + consent + roles (one scoped query) ──────────────
  const { data: profileRow, error: profileError } = await admin
    .from("users")
    .select(
      "first_name, middle_name, last_name, created_at, active_status, must_change_password, privacy_consent_at, privacy_consent_version, user_roles(roles(name))",
    )
    .eq("uid", user.id)
    .eq("active_status", 1)
    .is("deleted_at", null)
    .single();

  if (profileError || !profileRow) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  const raw = profileRow as unknown as {
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    created_at: string;
    active_status: number;
    must_change_password: boolean;
    privacy_consent_at: string | null;
    privacy_consent_version: string | null;
    user_roles: Array<{ roles: { name: string } | { name: string }[] | null }> | null;
  };

  const roles = (raw.user_roles ?? [])
    .map((ur) => (Array.isArray(ur.roles) ? ur.roles[0] : ur.roles)?.name)
    .filter((n): n is string => Boolean(n));

  // ── 2. Assignments (Redis-cached; current school year only) ────────────────
  const ctx = await getUserAssignmentsContext(user.id);

  // ── 3. Activity log — the user's OWN actions. entity_label is deliberately
  //    NOT selected: it often names third parties this user acted upon, and a
  //    rights exercise must not repackage others' PII as the requester's data.
  const { data: activityRows, error: activityError } = await admin
    .from("audit_logs")
    .select("created_at, category, action, entity_type")
    .eq("actor_id", user.id)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_CAP + 1);

  if (activityError) {
    console.error("[data-export] activity query error:", activityError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const allActivity = (activityRows ?? []) as Array<{
    created_at: string;
    category: string;
    action: string;
    entity_type: string;
  }>;
  const truncated = allActivity.length > ACTIVITY_CAP;
  const entries = allActivity.slice(0, ACTIVITY_CAP).map((r) => ({
    timestamp: r.created_at,
    category: r.category,
    action: r.action,
    entity_type: r.entity_type,
  }));

  // ── Assemble payload. generated_at + the filename date come from one UTC instant. ──
  const generatedAt = new Date().toISOString();
  const dateStr = generatedAt.slice(0, 10); // YYYY-MM-DD (UTC)

  const payload = {
    export_metadata: {
      generated_at: generatedAt,
      subject_uid: user.id,
      description:
        "Personal data held by ClassCloud about this account (RA 10173 Sec. 16/18).",
      scope_notes:
        "Timestamps are UTC. Assignments reflect the current school year only. The activity log lists actions you performed (most recent 2000) and deliberately omits the names of other people you acted upon, to protect their privacy.",
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
    },
    profile: {
      first_name: raw.first_name ?? "",
      middle_name: raw.middle_name ?? "",
      last_name: raw.last_name ?? "",
      email: user.email ?? "",
    },
    account: {
      created_at: raw.created_at,
      active: raw.active_status === 1,
      must_change_password: raw.must_change_password,
    },
    consent: {
      privacy_consent_at: raw.privacy_consent_at,
      privacy_consent_version: raw.privacy_consent_version,
    },
    roles,
    assignments_current: {
      note: "Active assignments for the current school year. Historical/past-year assignments are not included.",
      advisory: ctx.advisorySections.map((s) => ({
        grade: s.grade_display_name,
        section: s.name,
      })),
      teaching: ctx.teachingAssignments.map((t) => ({
        grade: t.grade_display_name,
        section: t.section_name,
        subject: t.subject_name,
      })),
      grade_subject_leader: ctx.gsl
        ? { grade: ctx.gsl.grade_display_name, subject: ctx.gsl.subject_name }
        : null,
      subject_coordinator: ctx.coordinator
        ? { group: ctx.coordinator.subject_group_name }
        : null,
    },
    activity_log: {
      truncated,
      note: "Actions you performed. Names of third parties you acted upon are intentionally omitted.",
      entries,
    },
  };

  // RA 10173 accountability: record that the right of access was exercised.
  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "personal_data_exported",
      entity_type: "user",
      entity_id: user.id,
      metadata: { activity_rows: entries.length, truncated },
    }).catch(() => {}),
  );

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="classcloud-my-data-${dateStr}.json"`,
    },
  });
};

export const GET = withErrorHandler(_GET);
