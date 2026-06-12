/**
 * Notification dispatchers for transfer request and direct move events.
 *
 * Each exported dispatch* function is fire-and-forget: call with `void`.
 * Errors are logged but never thrown so they never block the HTTP response.
 *
 * Deduplication rules:
 *   Rule 1 — Actor exclusion: the user who performed an action is never
 *             self-notified.
 *   Rule 2 — From-adviser precedence: if the from-section adviser is also an
 *             admin (students.full_access), they receive the from-adviser
 *             notification (more contextually relevant) and are excluded from
 *             the generic admin "awaiting review" list.
 */

import { adminClient as admin } from "@/lib/supabase/admin";
import {
  sendTransferRequestCreatedToFromAdviser,
  sendTransferRequestCreatedToAdmin,
  sendTransferRequestApprovedToRequester,
  sendTransferRequestApprovedToFromAdviser,
  sendTransferRequestRejectedToRequester,
  sendTransferRequestRejectedToFromAdviser,
  sendDirectMoveToFromAdviser,
  sendDirectMoveToToAdviser,
  sendSubjectReportsCompleted,
  sendSubjectGroupReportsCompleted,
  sendAllReportsCompleted,
} from "@/lib/email/templates";
import { getHomeActiveContextCached } from "@/lib/services/homeServerService";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserInfo = {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
};

type NotificationInsert = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  reference_id: string | null;
  reference_type: string | null;
  action_url: string | null;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns all active, non-deleted users that have the given permission
 * (via any of their assigned roles), along with their email addresses.
 */
async function getUsersWithPermission(
  permissionName: string,
): Promise<UserInfo[]> {
  // 1. Find permission_id by name
  const { data: perm } = await admin
    .from("permissions")
    .select("permission_id")
    .eq("name", permissionName)
    .maybeSingle();
  if (!perm) return [];

  // 2. Find role_ids that carry this permission
  const { data: rolePerms } = await admin
    .from("role_permissions")
    .select("role_id")
    .eq("permission_id", (perm as any).permission_id);
  const roleIds = ((rolePerms ?? []) as any[]).map((r) => r.role_id);
  if (roleIds.length === 0) return [];

  // 3. Find user UIDs assigned to those roles
  const { data: userRoleRows } = await admin
    .from("user_roles")
    .select("uid")
    .in("role_id", roleIds);
  const uids = [
    ...new Set(((userRoleRows ?? []) as any[]).map((r) => r.uid as string)),
  ];
  if (uids.length === 0) return [];

  // 4. Filter to active, non-deleted users and get display names
  const { data: publicUsers } = await admin
    .from("users")
    .select("uid, first_name, last_name")
    .in("uid", uids)
    .eq("active_status", 1)
    .is("deleted_at", null);
  if (!publicUsers || (publicUsers as any[]).length === 0) return [];

  // 5. Fetch emails in a single Admin API call and filter to the UIDs we need.
  //    One call is far cheaper than N parallel getUserById() calls, which can
  //    hit Supabase's Auth Admin API rate limit with many admin accounts.
  //    Assumption: total user count fits within 1000 (valid for a school app).
  const targetUids = new Set((publicUsers as any[]).map((u) => u.uid as string));
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map<string, string>(
    (authData?.users ?? [])
      .filter((u) => targetUids.has(u.id))
      .map((u) => [u.id, u.email ?? ""]),
  );

  return ((publicUsers as any[])
    .map((u) => ({
      uid: u.uid as string,
      email: emailMap.get(u.uid) ?? "",
      firstName: (u.first_name ?? "") as string,
      lastName: (u.last_name ?? "") as string,
    }))
    .filter((u) => u.email !== ""));
}

/** Returns a single user's display info + email, or null if not found. */
async function getUserWithEmail(uid: string): Promise<UserInfo | null> {
  const [{ data: publicUser }, { data: authData }] = await Promise.all([
    admin
      .from("users")
      .select("uid, first_name, last_name")
      .eq("uid", uid)
      .maybeSingle(),
    admin.auth.admin.getUserById(uid),
  ]);
  if (!publicUser || !authData?.user?.email) return null;
  const u = publicUser as any;
  return {
    uid,
    email: authData.user.email,
    firstName: (u.first_name ?? "") as string,
    lastName: (u.last_name ?? "") as string,
  };
}

/**
 * Above this many recipients, a single listUsers() page is cheaper and safer
 * than N targeted getUserById calls (which would risk the Auth Admin rate
 * limit). Below it, targeted lookups avoid pulling the entire auth user list.
 */
const EMAIL_LOOKUP_BATCH_THRESHOLD = 25;

/**
 * Resolves UIDs -> email, adaptively. The common report-completion case is a
 * handful of recipients (a GSL / coordinator, or a few principals), where
 * targeted getUserById calls are cheaper than fetching up to 1000 auth users —
 * and immune to the >1000-user pagination gap. Only a large set falls back to a
 * single listUsers() page to avoid the rate limit that many parallel lookups
 * would risk. Failed lookups degrade to "" rather than failing the batch.
 * These Auth Admin calls do not go through PostgREST, so they cost no set_config.
 */
async function resolveEmails(uids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids)];
  if (unique.length === 0) return new Map();

  if (unique.length <= EMAIL_LOOKUP_BATCH_THRESHOLD) {
    const entries = await Promise.all(
      unique.map(async (uid) => {
        try {
          const { data } = await admin.auth.admin.getUserById(uid);
          return [uid, data?.user?.email ?? ""] as const;
        } catch (e) {
          console.error("[notifications] getUserById failed:", e);
          return [uid, ""] as const;
        }
      }),
    );
    return new Map(entries.filter(([, email]) => email !== ""));
  }

  const target = new Set(unique);
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return new Map(
    (authData?.users ?? [])
      .filter((u) => target.has(u.id) && !!u.email)
      .map((u) => [u.id, u.email as string]),
  );
}

/** Inserts notification rows; logs on failure but never throws. */
async function insertNotifications(rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from("notifications").insert(rows);
  if (error) console.error("[notifications] insert failed:", error.message);
}

/**
 * Returns the UIDs from `candidates` that are non-null and not present in
 * `excludeUids`. Deduplicates the result.
 *
 * Used to apply the deduplication rules (actor exclusion, role precedence)
 * before building notification rows or fetching emails.
 */
function buildRecipientList(
  candidates: (string | null)[],
  excludeUids: (string | null)[] = [],
): string[] {
  const excluded = new Set(excludeUids.filter((u): u is string => u !== null));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const uid of candidates) {
    if (!uid || excluded.has(uid) || seen.has(uid)) continue;
    seen.add(uid);
    result.push(uid);
  }
  return result;
}

/** Shape of a single in-app pointer notification (no email). */
type SimpleNotification = {
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
};

/**
 * Sends ONE in-app notification to every recipient in `uids`, after applying
 * actor/duplicate exclusion via buildRecipientList. One batched insert; no-ops
 * when nobody qualifies. Used by the Part 2 simple-pointer dispatchers.
 */
async function insertSimpleNotifications(
  uids: (string | null)[],
  notif: SimpleNotification,
  excludeUids: (string | null)[] = [],
): Promise<void> {
  const recipients = buildRecipientList(uids, excludeUids);
  if (recipients.length === 0) return;
  await insertNotifications(
    recipients.map((uid) => ({
      user_id: uid,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      reference_id: notif.reference_id ?? null,
      reference_type: notif.reference_type ?? null,
      action_url: notif.action_url,
    })),
  );
}

// ── User signup dispatcher ─────────────────────────────────────────────────────

/**
 * Called after a self-registration email is verified.
 * Uses a single SQL RPC to find all users.full_access recipients and insert
 * notification rows atomically — one DB round-trip regardless of admin count.
 * Fire-and-forget: never throws.
 */
export async function dispatchNewSignup({
  newUserUid,
  firstName,
  lastName,
}: {
  newUserUid: string;
  firstName: string;
  lastName: string;
}): Promise<void> {
  try {
    const fullName = `${firstName} ${lastName}`.trim();
    const { error } = await admin.rpc("notify_new_signup", {
      p_uid: newUserUid,
      p_full_name: fullName,
      p_action_url: SIGNUP_URL,
    });
    if (error) console.error("[notifications] notify_new_signup RPC:", error.message);
  } catch (err) {
    console.error("[notifications] dispatchNewSignup:", err);
  }
}

/** Builds a section display string: "Section Name (Grade Level)". */
function sectionDisplay(name: string, glDisplayName: string): string {
  return glDisplayName ? `${name} (${glDisplayName})` : name;
}

/** Resolves a grade_levels join that may be array or object. */
function glDisplay(rawGl: any): string {
  const gl = Array.isArray(rawGl) ? rawGl[0] : rawGl;
  return (gl?.display_name ?? "") as string;
}

const ACTION_URL = "/school/classes/transfer-requests";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://classcloudph.app";

// Part 2 pointer notifications deep-link into the surface that shows the changed
// assignment/role. Every recipient can open these (admin pages like
// /school/faculty are not accessible to the faculty/advisers being notified).
const USER_HOME_URL = "/";
// Settings → My Assignments card (advisory, teaching load, coordinator, GSL).
const ASSIGN_URL = "/settings?section=assignments";
// Settings → Roles card.
const ROLES_URL = "/settings?section=roles";
// User Management with the Pending collapsible opened.
const SIGNUP_URL = "/user-roles/users?pending=open";

// ── Shared pointer copy (single source of truth) ────────────────────────────────
//
// The coordinator / GSL / adviser pointer notifications fire from more than one
// dispatcher (the faculty-load wizard AND the dedicated assign routes). Defining
// their copy + target once here keeps the two paths from drifting apart.
type PointerSpec = {
  type: string;
  title: string;
  /** Static string, or a builder for section-scoped variants. */
  body: string | ((section: string) => string);
  reference_type: string;
  action_url: string;
};

const POINTERS = {
  adviserAssigned: {
    type: "class.adviser_assigned",
    title: "Advisory Class Assigned",
    body: (section: string) => `You were assigned as adviser of ${section}.`,
    reference_type: "section",
    action_url: ASSIGN_URL,
  },
  adviserRemoved: {
    type: "class.adviser_removed",
    title: "Advisory Class Removed",
    body: (section: string) => `You were removed as adviser of ${section}.`,
    reference_type: "section",
    action_url: ASSIGN_URL,
  },
  subjectTeachersChanged: {
    type: "class.subject_teachers_changed",
    title: "Subject Assignments Updated",
    body: (section: string) =>
      `The subject teacher assignments for ${section} were updated.`,
    reference_type: "section",
    action_url: ASSIGN_URL,
  },
  loadChanged: {
    type: "faculty.load_changed",
    title: "Teaching Load Updated",
    body: "An administrator updated your teaching load.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  loadRemoved: {
    type: "faculty.load_removed",
    title: "Teaching Load Removed",
    body: "An administrator removed your teaching load.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  coordinatorAssigned: {
    type: "faculty.coordinator_assigned",
    title: "Subject Coordinator Assignment",
    body: "You were assigned as a subject coordinator.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  coordinatorRemoved: {
    type: "faculty.coordinator_removed",
    title: "Subject Coordinator Removed",
    body: "You were removed as a subject coordinator.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  gslAssigned: {
    type: "faculty.gsl_assigned",
    title: "Grade Subject Leader Assignment",
    body: "You were assigned as a grade subject leader.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  gslRemoved: {
    type: "faculty.gsl_removed",
    title: "Grade Subject Leader Removed",
    body: "You were removed as a grade subject leader.",
    reference_type: "faculty",
    action_url: ASSIGN_URL,
  },
  roleChanged: {
    type: "role.changed",
    title: "Your Roles Were Updated",
    body: "An administrator updated your account roles.",
    reference_type: "user",
    action_url: ROLES_URL,
  },
} satisfies Record<string, PointerSpec>;

/** Resolves a PointerSpec body to a string, applying the section for builders. */
function pointerBody(spec: PointerSpec, section: string): string {
  return typeof spec.body === "function" ? spec.body(section) : spec.body;
}

/**
 * Builds a NotificationInsert row for a recipient from a shared PointerSpec.
 * `referenceId` defaults to the recipient uid (the convention these pointers use).
 */
function pointerRow(
  spec: PointerSpec,
  uid: string,
  { section = "a class", referenceId }: { section?: string; referenceId?: string | null } = {},
): NotificationInsert {
  return {
    user_id: uid,
    type: spec.type,
    title: spec.title,
    body: pointerBody(spec, section),
    reference_id: referenceId === undefined ? uid : referenceId,
    reference_type: spec.reference_type,
    action_url: spec.action_url,
  };
}

// ── Dispatchers ───────────────────────────────────────────────────────────────

/**
 * Called after a transfer request is successfully created.
 * Notifies: from-section adviser + all admins (deduplicated).
 */
export async function dispatchTransferRequestCreated({
  requestId,
  lrn,
  fromSectionId,
  toSectionId,
  requestedByUid,
}: {
  requestId: string;
  lrn: string;
  fromSectionId: number;
  toSectionId: number;
  requestedByUid: string;
}): Promise<void> {
  try {
    const [studentRes, fromSecRes, toSecRes, admins, requester] =
      await Promise.all([
        admin
          .from("students")
          .select("full_name")
          .eq("lrn", lrn)
          .maybeSingle(),
        admin
          .from("sections")
          .select("name, adviser_id, grade_levels(display_name)")
          .eq("section_id", fromSectionId)
          .maybeSingle(),
        admin
          .from("sections")
          .select("name, grade_levels(display_name)")
          .eq("section_id", toSectionId)
          .maybeSingle(),
        getUsersWithPermission("students.full_access"),
        getUserWithEmail(requestedByUid),
      ]);

    const fromSec = fromSecRes.data as any;
    const toSec = toSecRes.data as any;
    const studentName =
      ((studentRes.data as any)?.full_name as string | undefined) ?? lrn;
    const fromSectionName = sectionDisplay(
      fromSec?.name ?? "",
      glDisplay(fromSec?.grade_levels),
    );
    const toSectionName = sectionDisplay(
      toSec?.name ?? "",
      glDisplay(toSec?.grade_levels),
    );
    const requesterName = requester
      ? `${requester.firstName} ${requester.lastName}`.trim()
      : "An adviser";
    const fromAdviserUid = (fromSec?.adviser_id ?? null) as string | null;

    // Rule 2: from-adviser who is also an admin gets the from-adviser notif
    // and is excluded from the generic admin list.
    const fromAdviserRecipients = buildRecipientList([fromAdviserUid]);
    const adminRecipients = buildRecipientList(admins.map((u) => u.uid), [fromAdviserUid]);

    const notifRows: NotificationInsert[] = [];

    for (const uid of fromAdviserRecipients) {
      notifRows.push({
        user_id: uid,
        type: "transfer_request.created",
        title: "Transfer Request for Your Student",
        body: `${studentName} from ${fromSectionName} has been requested for transfer to ${toSectionName} by ${requesterName}.`,
        reference_id: requestId,
        reference_type: "transfer_request",
        action_url: ACTION_URL,
      });
    }

    for (const uid of adminRecipients) {
      notifRows.push({
        user_id: uid,
        type: "transfer_request.created",
        title: "New Transfer Request Awaiting Review",
        body: `${requesterName} submitted a transfer request for ${studentName} from ${fromSectionName} to ${toSectionName}.`,
        reference_id: requestId,
        reference_type: "transfer_request",
        action_url: ACTION_URL,
      });
    }

    await insertNotifications(notifRows);

    // Emails (fire-and-forget per recipient)
    for (const uid of fromAdviserRecipients) {
      getUserWithEmail(uid).then((u) => {
        if (!u?.email) return;
        sendTransferRequestCreatedToFromAdviser({
          to: u.email,
          firstName: u.firstName,
          studentName,
          fromSection: fromSectionName,
          toSection: toSectionName,
          requestedByName: requesterName,
        }).catch((e) =>
          console.error("[email] sendTransferRequestCreatedToFromAdviser:", e),
        );
      });
    }

    const adminRecipientSet = new Set(adminRecipients);
    for (const a of admins.filter((u) => adminRecipientSet.has(u.uid))) {
      if (!a.email) continue;
      sendTransferRequestCreatedToAdmin({
        to: a.email,
        firstName: a.firstName,
        studentName,
        fromSection: fromSectionName,
        toSection: toSectionName,
        requestedByName: requesterName,
        actionUrl: `${SITE_URL}${ACTION_URL}`,
      }).catch((e) =>
        console.error("[email] sendTransferRequestCreatedToAdmin:", e),
      );
    }
  } catch (err) {
    console.error("[notifications] dispatchTransferRequestCreated:", err);
  }
}

/**
 * Called after a transfer request is approved.
 * Notifies: requesting adviser + from-section adviser (deduplicated by Rule 1).
 */
export async function dispatchTransferRequestApproved({
  requestId,
}: {
  requestId: string;
}): Promise<void> {
  try {
    const { data: req } = await admin
      .from("section_transfer_requests")
      .select(
        `lrn, requested_by, reviewed_by,
         student:students(full_name),
         from_section:sections!from_section_id(name, adviser_id, grade_levels(display_name)),
         to_section:sections!to_section_id(name, grade_levels(display_name))`,
      )
      .eq("request_id", requestId)
      .maybeSingle();

    if (!req) return;
    const r = req as any;
    const student = Array.isArray(r.student) ? r.student[0] : r.student;
    const fromSec = Array.isArray(r.from_section)
      ? r.from_section[0]
      : r.from_section;
    const toSec = Array.isArray(r.to_section) ? r.to_section[0] : r.to_section;

    const studentName = (student?.full_name ?? r.lrn) as string;
    const fromSectionName = sectionDisplay(
      fromSec?.name ?? "",
      glDisplay(fromSec?.grade_levels),
    );
    const toSectionName = sectionDisplay(
      toSec?.name ?? "",
      glDisplay(toSec?.grade_levels),
    );
    const fromAdviserUid = (fromSec?.adviser_id ?? null) as string | null;
    const requestedByUid = r.requested_by as string;
    const reviewedByUid = (r.reviewed_by ?? null) as string | null;

    const notifRows: NotificationInsert[] = [];

    // Requesting adviser always notified (they never approve their own request)
    notifRows.push({
      user_id: requestedByUid,
      type: "transfer_request.approved",
      title: "Transfer Request Approved",
      body: `Your request to transfer ${studentName} to ${toSectionName} has been approved.`,
      reference_id: requestId,
      reference_type: "transfer_request",
      action_url: ACTION_URL,
    });

    // From-section adviser — Rule 1: skip if same as reviewer or requester
    const fromAdviserRecipients = buildRecipientList(
      [fromAdviserUid],
      [reviewedByUid, requestedByUid],
    );
    for (const uid of fromAdviserRecipients) {
      notifRows.push({
        user_id: uid,
        type: "transfer_request.approved",
        title: "Student Transferred Out",
        body: `${studentName} has been transferred from your class to ${toSectionName}.`,
        reference_id: requestId,
        reference_type: "transfer_request",
        action_url: ACTION_URL,
      });
    }

    await insertNotifications(notifRows);

    // Emails
    const [requesterUser, fromAdviserUser] = await Promise.all([
      getUserWithEmail(requestedByUid),
      fromAdviserRecipients.length > 0
        ? getUserWithEmail(fromAdviserRecipients[0])
        : Promise.resolve(null),
    ]);

    if (requesterUser?.email) {
      sendTransferRequestApprovedToRequester({
        to: requesterUser.email,
        firstName: requesterUser.firstName,
        studentName,
        fromSection: fromSectionName,
        toSection: toSectionName,
      }).catch((e) =>
        console.error("[email] sendTransferRequestApprovedToRequester:", e),
      );
    }
    if (fromAdviserUser?.email) {
      sendTransferRequestApprovedToFromAdviser({
        to: fromAdviserUser.email,
        firstName: fromAdviserUser.firstName,
        studentName,
        toSection: toSectionName,
      }).catch((e) =>
        console.error("[email] sendTransferRequestApprovedToFromAdviser:", e),
      );
    }
  } catch (err) {
    console.error("[notifications] dispatchTransferRequestApproved:", err);
  }
}

/**
 * Called after a transfer request is rejected.
 * Notifies: requesting adviser + from-section adviser (deduplicated by Rule 1).
 */
export async function dispatchTransferRequestRejected({
  requestId,
  notes,
}: {
  requestId: string;
  notes: string | null;
}): Promise<void> {
  try {
    const { data: req } = await admin
      .from("section_transfer_requests")
      .select(
        `lrn, requested_by, reviewed_by,
         student:students(full_name),
         from_section:sections!from_section_id(name, adviser_id, grade_levels(display_name)),
         to_section:sections!to_section_id(name, grade_levels(display_name))`,
      )
      .eq("request_id", requestId)
      .maybeSingle();

    if (!req) return;
    const r = req as any;
    const student = Array.isArray(r.student) ? r.student[0] : r.student;
    const fromSec = Array.isArray(r.from_section)
      ? r.from_section[0]
      : r.from_section;
    const toSec = Array.isArray(r.to_section) ? r.to_section[0] : r.to_section;

    const studentName = (student?.full_name ?? r.lrn) as string;
    const fromSectionName = sectionDisplay(
      fromSec?.name ?? "",
      glDisplay(fromSec?.grade_levels),
    );
    const toSectionName = sectionDisplay(
      toSec?.name ?? "",
      glDisplay(toSec?.grade_levels),
    );
    const fromAdviserUid = (fromSec?.adviser_id ?? null) as string | null;
    const requestedByUid = r.requested_by as string;
    const reviewedByUid = (r.reviewed_by ?? null) as string | null;

    const notifRows: NotificationInsert[] = [];

    // Requesting adviser always notified
    notifRows.push({
      user_id: requestedByUid,
      type: "transfer_request.rejected",
      title: "Transfer Request Declined",
      body: `Your request to transfer ${studentName} to ${toSectionName} has been declined.`,
      reference_id: requestId,
      reference_type: "transfer_request",
      action_url: ACTION_URL,
    });

    // From-section adviser — Rule 1: skip if same as reviewer or requester
    const fromAdviserRecipients = buildRecipientList(
      [fromAdviserUid],
      [reviewedByUid, requestedByUid],
    );
    for (const uid of fromAdviserRecipients) {
      notifRows.push({
        user_id: uid,
        type: "transfer_request.rejected",
        title: "Transfer Request Declined",
        body: `A transfer request for ${studentName} in your class has been declined.`,
        reference_id: requestId,
        reference_type: "transfer_request",
        action_url: ACTION_URL,
      });
    }

    await insertNotifications(notifRows);

    // Emails
    const [requesterUser, fromAdviserUser] = await Promise.all([
      getUserWithEmail(requestedByUid),
      fromAdviserRecipients.length > 0
        ? getUserWithEmail(fromAdviserRecipients[0])
        : Promise.resolve(null),
    ]);

    if (requesterUser?.email) {
      sendTransferRequestRejectedToRequester({
        to: requesterUser.email,
        firstName: requesterUser.firstName,
        studentName,
        fromSection: fromSectionName,
        toSection: toSectionName,
        notes,
      }).catch((e) =>
        console.error("[email] sendTransferRequestRejectedToRequester:", e),
      );
    }
    if (fromAdviserUser?.email) {
      sendTransferRequestRejectedToFromAdviser({
        to: fromAdviserUser.email,
        firstName: fromAdviserUser.firstName,
        studentName,
      }).catch((e) =>
        console.error("[email] sendTransferRequestRejectedToFromAdviser:", e),
      );
    }
  } catch (err) {
    console.error("[notifications] dispatchTransferRequestRejected:", err);
  }
}

/**
 * Called after an admin directly moves a student (move / update_move actions).
 * Notifies: from-section adviser + to-section adviser (both skip if actor).
 *
 * IMPORTANT: fromSectionId must be pre-fetched BEFORE the move RPC because
 * the old enrollment is soft-deleted atomically inside the RPC.
 */
export async function dispatchDirectMove({
  lrn,
  fromSectionId,
  toSectionId,
  actorUid,
}: {
  lrn: string;
  fromSectionId: number;
  toSectionId: number;
  actorUid: string;
}): Promise<void> {
  try {
    const [studentRes, fromSecRes, toSecRes] = await Promise.all([
      admin.from("students").select("full_name").eq("lrn", lrn).maybeSingle(),
      admin
        .from("sections")
        .select("name, adviser_id, grade_levels(display_name)")
        .eq("section_id", fromSectionId)
        .maybeSingle(),
      admin
        .from("sections")
        .select("name, adviser_id, grade_levels(display_name)")
        .eq("section_id", toSectionId)
        .maybeSingle(),
    ]);

    const fromSec = fromSecRes.data as any;
    const toSec = toSecRes.data as any;
    const studentName =
      ((studentRes.data as any)?.full_name as string | undefined) ?? lrn;
    const fromSectionName = sectionDisplay(
      fromSec?.name ?? "",
      glDisplay(fromSec?.grade_levels),
    );
    const toSectionName = sectionDisplay(
      toSec?.name ?? "",
      glDisplay(toSec?.grade_levels),
    );
    const fromAdviserUid = (fromSec?.adviser_id ?? null) as string | null;
    const toAdviserUid = (toSec?.adviser_id ?? null) as string | null;

    const notifRows: NotificationInsert[] = [];

    // Rule 1: skip if adviser is the actor; also avoid double-notifying
    // if both sections share the same adviser.
    const fromAdviserRecipients = buildRecipientList([fromAdviserUid], [actorUid]);
    const toAdviserRecipients = buildRecipientList([toAdviserUid], [actorUid, fromAdviserUid]);

    for (const uid of fromAdviserRecipients) {
      notifRows.push({
        user_id: uid,
        type: "direct_move.removed",
        title: "Student Transferred Out",
        body: `${studentName} has been transferred out of your class to ${toSectionName} by an administrator.`,
        reference_id: null,
        reference_type: "direct_move",
        action_url: USER_HOME_URL,
      });
    }

    for (const uid of toAdviserRecipients) {
      notifRows.push({
        user_id: uid,
        type: "direct_move.added",
        title: "New Student Added to Your Class",
        body: `${studentName} has been transferred to your class from ${fromSectionName} by an administrator.`,
        reference_id: null,
        reference_type: "direct_move",
        action_url: USER_HOME_URL,
      });
    }

    await insertNotifications(notifRows);

    // Emails
    const [fromAdviserUser, toAdviserUser] = await Promise.all([
      fromAdviserRecipients.length > 0
        ? getUserWithEmail(fromAdviserRecipients[0])
        : Promise.resolve(null),
      toAdviserRecipients.length > 0
        ? getUserWithEmail(toAdviserRecipients[0])
        : Promise.resolve(null),
    ]);

    if (fromAdviserUser?.email) {
      sendDirectMoveToFromAdviser({
        to: fromAdviserUser.email,
        firstName: fromAdviserUser.firstName,
        studentName,
        fromSection: fromSectionName,
        toSection: toSectionName,
      }).catch((e) =>
        console.error("[email] sendDirectMoveToFromAdviser:", e),
      );
    }
    if (toAdviserUser?.email) {
      sendDirectMoveToToAdviser({
        to: toAdviserUser.email,
        firstName: toAdviserUser.firstName,
        studentName,
        fromSection: fromSectionName,
        toSection: toSectionName,
      }).catch((e) =>
        console.error("[email] sendDirectMoveToToAdviser:", e),
      );
    }
  } catch (err) {
    console.error("[notifications] dispatchDirectMove:", err);
  }
}

// ── Report completion dispatcher ────────────────────────────────────────────────

/** A recipient returned by notify_report_completion (email resolved in JS). */
type ReportRecipient = {
  uid: string;
  first_name: string | null;
};

/** One milestone fired by notify_report_completion (in-app rows already inserted). */
type FiredMilestone = {
  type:
    | "reports.subject_completed"
    | "reports.group_completed"
    | "reports.all_completed";
  label: string;
  recipients: ReportRecipient[];
};

/** Envelope returned by the RPC. */
type ReportCompletionResult = {
  milestones: FiredMilestone[];
};

/**
 * Called fire-and-forget after an exam's reports are finalized.
 *
 * The notify_report_completion RPC does the heavy lifting in ONE PostgREST call
 * (one set_config): completion detection, ledger dedup (fire-once), in-app
 * inserts, and returning the fired milestones with recipient UIDs + names. This
 * dispatcher then resolves recipient emails via the Auth Admin API (no
 * set_config) and reads the term / school year from the cached active context
 * (warm = zero DB) — neither of which the completion RPC needs to touch. Never
 * throws.
 */
export async function dispatchReportCompletions({
  examId,
  actorUid,
}: {
  examId: number;
  actorUid: string;
}): Promise<void> {
  try {
    const { data, error } = await admin.rpc("notify_report_completion", {
      p_exam_id: examId,
      p_actor: actorUid,
    });
    if (error) {
      console.error("[notifications] notify_report_completion RPC:", error.message);
      return;
    }

    const result = (data ?? {}) as ReportCompletionResult;
    const milestones = result.milestones ?? [];
    if (milestones.length === 0) return;

    // Emails via the Auth Admin API (off PostgREST); term + school year from the
    // cached active context (warm = no DB). The RPC's active-quarter guard means
    // the fired milestones always belong to this same active term.
    const allUids = milestones.flatMap((m) => (m.recipients ?? []).map((r) => r.uid));
    const [emailMap, ctx] = await Promise.all([
      resolveEmails(allUids),
      getHomeActiveContextCached(),
    ]);
    const term = ctx.termName ?? "";
    const schoolYear = ctx.yearRange ?? "";
    const reportsUrl = `${SITE_URL}/reports`;

    // Collect every send so we can await them: this dispatcher runs inside the
    // route's after(), which only keeps the serverless instance alive until the
    // returned promise settles. Each send catches its own error → allSettled
    // never rejects, so a failed email never blocks the others or the finalize.
    const emailPromises: Promise<void>[] = [];

    for (const m of milestones) {
      for (const r of m.recipients ?? []) {
        const email = emailMap.get(r.uid);
        if (!email) continue;
        const firstName = r.first_name ?? "";

        if (m.type === "reports.subject_completed") {
          emailPromises.push(
            sendSubjectReportsCompleted({
              to: email,
              firstName,
              subjectLabel: m.label,
              term,
              actionUrl: reportsUrl,
            }).catch((e) =>
              console.error("[email] sendSubjectReportsCompleted:", e),
            ),
          );
        } else if (m.type === "reports.group_completed") {
          emailPromises.push(
            sendSubjectGroupReportsCompleted({
              to: email,
              firstName,
              groupName: m.label,
              term,
              actionUrl: reportsUrl,
            }).catch((e) =>
              console.error("[email] sendSubjectGroupReportsCompleted:", e),
            ),
          );
        } else if (m.type === "reports.all_completed") {
          emailPromises.push(
            sendAllReportsCompleted({
              to: email,
              firstName,
              term,
              schoolYear,
              actionUrl: reportsUrl,
            }).catch((e) =>
              console.error("[email] sendAllReportsCompleted:", e),
            ),
          );
        }
      }
    }

    await Promise.allSettled(emailPromises);
  } catch (err) {
    console.error("[notifications] dispatchReportCompletions:", err);
  }
}

// ── Part 2 · Simple-pointer dispatchers (in-app only) ───────────────────────────
//
// All are fire-and-forget, never throw, actor-excluded, and write at most one
// row per (user, change-type) in a single batched insert. They reuse diffs the
// routes already computed for audit — no extra reads. Recipients are individual
// faculty/staff, so every action_url is the home dashboard (USER_HOME_URL).

/**
 * Role granted/removed (update-profile). Notifies the target user only when the
 * role set actually changed; skips self-edits. No-op otherwise.
 */
export async function dispatchRoleChange({
  targetUid,
  oldRoleIds,
  newRoleIds,
  actorUid,
}: {
  targetUid: string;
  oldRoleIds: number[];
  newRoleIds: number[];
  actorUid: string;
}): Promise<void> {
  try {
    if (targetUid === actorUid) return; // skip self-edit
    const oldSet = new Set(oldRoleIds);
    const newSet = new Set(newRoleIds);
    const changed =
      oldSet.size !== newSet.size || [...newSet].some((r) => !oldSet.has(r));
    if (!changed) return; // no role delta → nothing fires
    const spec = POINTERS.roleChanged;
    await insertSimpleNotifications(
      [targetUid],
      {
        type: spec.type,
        title: spec.title,
        body: pointerBody(spec, ""),
        action_url: spec.action_url,
        reference_id: targetUid,
        reference_type: spec.reference_type,
      },
      [actorUid],
    );
  } catch (err) {
    console.error("[notifications] dispatchRoleChange:", err);
  }
}

/** A single delta entry from assign_faculty_academic_load's `_audit.changes[]`. */
type LoadChange = Record<string, unknown>;

/**
 * Faculty academic-load wizard (assign-load) — change-type-driven (Part 2a).
 *
 * Hard rules:
 *   - null/empty changes → return immediately, fire nothing (never a blanket
 *     "wizard succeeded" notification).
 *   - one row per (faculty, change-type): multiple assignment_* deltas collapse
 *     into a single faculty.load_changed; only change types actually present fire.
 *   - actor excluded throughout.
 *
 * The only recipient is the faculty member (the wizard never displaces a third
 * party — coordinator/GSL conflicts raise instead), so a single guard + one
 * batched insert suffices.
 */
export async function dispatchFacultyLoadChanged({
  facultyId,
  changes,
  actorUid,
}: {
  facultyId: string;
  changes: LoadChange[] | null | undefined;
  actorUid: string;
}): Promise<void> {
  try {
    if (!changes || changes.length === 0) return; // Hard rule 1
    if (buildRecipientList([facultyId], [actorUid]).length === 0) return; // actor == faculty

    const typeOf = (c: LoadChange) => (typeof c.type === "string" ? c.type : "");
    const sectionOf = (c: LoadChange) =>
      typeof c.section === "string" ? c.section : "a class";

    const rows: NotificationInsert[] = [];
    const push = (spec: PointerSpec, section?: string) =>
      rows.push(pointerRow(spec, facultyId, { section, referenceId: facultyId }));

    const adviserAssigned = changes.find((c) => typeOf(c) === "adviser_assigned");
    const adviserRemoved = changes.find((c) => typeOf(c) === "adviser_removed");
    const hasLoad = changes.some(
      (c) => typeOf(c) === "assignment_added" || typeOf(c) === "assignment_removed",
    );
    const hasCoordAssigned = changes.some((c) => typeOf(c) === "coordinator_assigned");
    const hasCoordRemoved = changes.some((c) => typeOf(c) === "coordinator_removed");
    const hasGslAssigned = changes.some((c) => typeOf(c) === "gsl_assigned");
    const hasGslRemoved = changes.some((c) => typeOf(c) === "gsl_removed");

    if (adviserAssigned) push(POINTERS.adviserAssigned, sectionOf(adviserAssigned));
    if (adviserRemoved) push(POINTERS.adviserRemoved, sectionOf(adviserRemoved));
    if (hasLoad) push(POINTERS.loadChanged);
    if (hasCoordAssigned) push(POINTERS.coordinatorAssigned);
    if (hasCoordRemoved) push(POINTERS.coordinatorRemoved);
    if (hasGslAssigned) push(POINTERS.gslAssigned);
    if (hasGslRemoved) push(POINTERS.gslRemoved);

    await insertNotifications(rows);
  } catch (err) {
    console.error("[notifications] dispatchFacultyLoadChanged:", err);
  }
}

/** Faculty teaching load fully removed (remove-load). Notifies the faculty member. */
export async function dispatchFacultyLoadRemoved({
  facultyId,
  actorUid,
}: {
  facultyId: string;
  actorUid: string;
}): Promise<void> {
  try {
    const spec = POINTERS.loadRemoved;
    await insertSimpleNotifications(
      [facultyId],
      {
        type: spec.type,
        title: spec.title,
        body: pointerBody(spec, ""),
        action_url: spec.action_url,
        reference_id: facultyId,
        reference_type: spec.reference_type,
      },
      [actorUid],
    );
  } catch (err) {
    console.error("[notifications] dispatchFacultyLoadRemoved:", err);
  }
}

/**
 * Subject coordinator assigned/displaced (subject-coordinators/assign).
 * New coordinator gets `_assigned`; the displaced prior holder gets `_removed`.
 */
export async function dispatchCoordinatorChange({
  newCoordinatorId,
  oldCoordinatorId,
  actorUid,
}: {
  newCoordinatorId: string;
  oldCoordinatorId: string | null;
  actorUid: string;
}): Promise<void> {
  try {
    const rows: NotificationInsert[] = [];
    for (const uid of buildRecipientList([newCoordinatorId], [actorUid])) {
      rows.push(pointerRow(POINTERS.coordinatorAssigned, uid));
    }
    for (const uid of buildRecipientList([oldCoordinatorId], [actorUid, newCoordinatorId])) {
      rows.push(pointerRow(POINTERS.coordinatorRemoved, uid));
    }
    await insertNotifications(rows);
  } catch (err) {
    console.error("[notifications] dispatchCoordinatorChange:", err);
  }
}

/**
 * Grade subject leader assigned/displaced (grade-subject-leaders/assign).
 * New GSL gets `_assigned`; the displaced prior holder gets `_removed`.
 */
export async function dispatchGslChange({
  newLeaderId,
  oldLeaderId,
  actorUid,
}: {
  newLeaderId: string;
  oldLeaderId: string | null;
  actorUid: string;
}): Promise<void> {
  try {
    const rows: NotificationInsert[] = [];
    for (const uid of buildRecipientList([newLeaderId], [actorUid])) {
      rows.push(pointerRow(POINTERS.gslAssigned, uid));
    }
    for (const uid of buildRecipientList([oldLeaderId], [actorUid, newLeaderId])) {
      rows.push(pointerRow(POINTERS.gslRemoved, uid));
    }
    await insertNotifications(rows);
  } catch (err) {
    console.error("[notifications] dispatchGslChange:", err);
  }
}

/**
 * Class adviser assigned/removed (assign-adviser). One of assignedUid/removedUid
 * is set per request (assign vs unassign); a reassignment never happens in a
 * single call (the assign RPC requires the section to be unassigned first).
 */
export async function dispatchAdviserChange({
  sectionLabel,
  assignedUid,
  removedUid,
  actorUid,
}: {
  sectionLabel: string | null;
  assignedUid: string | null;
  removedUid: string | null;
  actorUid: string;
}): Promise<void> {
  try {
    const section = sectionLabel ?? "a class";
    const rows: NotificationInsert[] = [];
    for (const uid of buildRecipientList([assignedUid], [actorUid])) {
      rows.push(pointerRow(POINTERS.adviserAssigned, uid, { section }));
    }
    for (const uid of buildRecipientList([removedUid], [actorUid, assignedUid])) {
      rows.push(pointerRow(POINTERS.adviserRemoved, uid, { section }));
    }
    await insertNotifications(rows);
  } catch (err) {
    console.error("[notifications] dispatchAdviserChange:", err);
  }
}

/**
 * Subject teachers changed for a section (assign-subject-teachers). The RPC's
 * audit diff carries only names, so we notify the currently-assigned teachers
 * from the request payload (the plan's "all currently-assigned" fallback) — one
 * section-level pointer each, actor excluded, no extra reads.
 */
export async function dispatchSubjectTeachersChanged({
  sectionLabel,
  teacherUids,
  actorUid,
}: {
  sectionLabel: string | null;
  teacherUids: (string | null)[];
  actorUid: string;
}): Promise<void> {
  try {
    const section = sectionLabel ?? "a class";
    const spec = POINTERS.subjectTeachersChanged;
    await insertSimpleNotifications(
      teacherUids,
      {
        type: spec.type,
        title: spec.title,
        body: pointerBody(spec, section),
        action_url: spec.action_url,
        reference_id: null,
        reference_type: spec.reference_type,
      },
      [actorUid],
    );
  } catch (err) {
    console.error("[notifications] dispatchSubjectTeachersChanged:", err);
  }
}
