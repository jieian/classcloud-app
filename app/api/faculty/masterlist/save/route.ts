import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { parseBody, SaveMasterlistSchema } from "@/lib/api-schemas";
import { insertAuditLog } from "@/lib/audit";
import { after } from "next/server";
import { redis } from "@/lib/redis";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

const _POST = async function (request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = parseBody(SaveMasterlistSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { sy_id: clientSyId, adviser_changes, assignment_changes } = parsed.data;

  // ── Stale-data / SY-change guard ─────────────────────────────────────────
  // Verify the school year the client loaded is still the active one.
  // Catches: SY changed while editing, SY deactivated while editing.
  const ctx = await getActiveContext();

  if (!ctx.sy_id) {
    return Response.json(
      { error: "No active school year. Please refresh and try again.", code: "NO_ACTIVE_SY" },
      { status: 409 },
    );
  }

  if (ctx.sy_id !== clientSyId) {
    return Response.json(
      {
        error: "The school year changed while you were editing. Please refresh and try again.",
        code: "SY_CHANGED",
      },
      { status: 409 },
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (adviser_changes.length === 0 && assignment_changes.length === 0) {
    return Response.json({ success: true }, { status: 200 });
  }

  // Collect old assignees so we can sync their JWT claims after role changes
  const sectionIds = adviser_changes.map((c) => c.section_id);
  const csIds = assignment_changes.map((c) => c.curriculum_subject_id);
  const assignmentSectionIds = assignment_changes.map((c) => c.section_id);

  const [{ data: oldAdvisers }, { data: oldTeachers }] = await Promise.all([
    sectionIds.length > 0
      ? adminClient
          .from("sections")
          .select("adviser_id")
          .in("section_id", sectionIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    assignmentSectionIds.length > 0 && csIds.length > 0
      ? adminClient
          .from("teacher_class_assignments")
          .select("teacher_id")
          .in("section_id", assignmentSectionIds)
          .in("curriculum_subject_id", csIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const { error } = await adminClient.rpc("save_teaching_load_masterlist", {
    p_advisers: adviser_changes,
    p_assignments: assignment_changes,
  });

  if (error) {
    console.error("save_teaching_load_masterlist error:", error.message);

    // Surface RPC-level guard errors as 409 so the client can show a meaningful message
    if (error.message.includes("NO_ACTIVE_SCHOOL_YEAR")) {
      return Response.json(
        { error: "No active school year. Please refresh and try again.", code: "NO_ACTIVE_SY" },
        { status: 409 },
      );
    }
    if (error.message.includes("STALE_DATA")) {
      return Response.json(
        {
          error: "The school year changed while you were editing. Please refresh and try again.",
          code: "SY_CHANGED",
        },
        { status: 409 },
      );
    }

    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  await redis.del("faculty:list", "faculty:candidates", "users:active");

  // Audit log — non-blocking
  after(async () => {
    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: "masterlist_saved",
      entity_type: "school_year",
      entity_id: String(ctx.sy_id),
      new_values: {
        adviser_changes: adviser_changes.length,
        assignment_changes: assignment_changes.length,
      },
    });
  });

  // Sync JWT claims for all affected UIDs (old + new), fire-and-forget
  const affectedUids = new Set<string>();
  for (const r of (oldAdvisers ?? []) as any[]) {
    if (r.adviser_id) affectedUids.add(r.adviser_id);
  }
  for (const r of (oldTeachers ?? []) as any[]) {
    if (r.teacher_id) affectedUids.add(r.teacher_id);
  }
  for (const c of adviser_changes) {
    if (c.adviser_id) affectedUids.add(c.adviser_id);
  }
  for (const c of assignment_changes) {
    if (c.teacher_id) affectedUids.add(c.teacher_id);
  }

  Promise.allSettled([...affectedUids].map((uid) => syncUserPermissions(uid))).catch(
    (err) => console.error("syncUserPermissions failed after save-masterlist:", err),
  );
  Promise.allSettled([...affectedUids].map((uid) => invalidateUserAssignmentsContext(uid))).catch(
    (err) => console.error("invalidateUserAssignmentsContext failed after save-masterlist:", err),
  );

  return Response.json({ success: true }, { status: 200 });
};

export const POST = withErrorHandler(_POST);
