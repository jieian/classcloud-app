import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

/**
 * Returns a summary of a user's active-SY assignments (advisory, teaching load,
 * GSL, subject coordinator). Used to warn an admin before deleting an account,
 * mirroring the "role is attached" warning in Roles Management.
 */
const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");
  if (!uid) {
    return Response.json({ error: "Missing uid" }, { status: 400 });
  }

  const ctx = await getUserAssignmentsContext(uid);

  return Response.json({
    data: {
      advisory: ctx.advisorySections.length,
      teaching: ctx.teachingAssignments.length,
      gsl: ctx.gsl?.subject_name ?? null,
      coordinator: ctx.coordinator?.subject_group_name ?? null,
    },
  });
};

export const GET = withErrorHandler(_GET);
