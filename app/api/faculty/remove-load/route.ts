import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
import { insertAuditLog } from "@/lib/audit";
import { invalidateUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { redis } from "@/lib/redis";
const _POST = async function(request: Request) {
  const caller = await getServerUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  // Permission check
  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { faculty_id } = body;

  if (!faculty_id) {
    return Response.json({ error: "Missing faculty_id" }, { status: 400 });
  }

  const { error } = await adminClient.rpc("remove_faculty_academic_load", {
    p_faculty_id: faculty_id,
  });

  if (error) {
    console.error("remove_faculty_academic_load error:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  await redis.del("faculty:list", "faculty:candidates", "coordinator:groups", "users:active");
  revalidateTag("sections", "minutes");
  revalidateTag("reports", "minutes");
  await invalidateUserAssignmentsContext(faculty_id);

  // Audit log — non-blocking
  after(async () => {
    const { data: facultyUser } = await adminClient
      .from("users")
      .select("first_name, last_name")
      .eq("uid", faculty_id)
      .maybeSingle();

    const label = facultyUser
      ? `${facultyUser.first_name} ${facultyUser.last_name}`.trim()
      : null;

    await insertAuditLog({
      actor_id: caller.id,
      category: "ACADEMIC",
      action: "faculty_load_removed",
      entity_type: "faculty",
      entity_id: faculty_id,
      entity_label: label,
    });
  });

  // Sync JWT claims — remove_faculty_academic_load strips the Faculty role
  syncUserPermissions(faculty_id).catch((err) =>
    console.error("syncUserPermissions failed after remove-load:", err),
  );

  return Response.json({ success: true }, { status: 200 });
}

export const POST = withErrorHandler(_POST)
