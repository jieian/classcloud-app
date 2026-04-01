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
} from "@/lib/email/templates";

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
        action_url: ACTION_URL,
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
        action_url: ACTION_URL,
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
