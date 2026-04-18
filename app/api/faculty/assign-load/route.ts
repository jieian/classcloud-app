import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { syncUserPermissions } from "@/lib/permissions-sync";
const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  // Permission check
  if (!getPermissionsFromUser(caller).includes("faculty.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { faculty_id, advisory_section_id, subject_assignments } = body;

  if (!faculty_id || !Array.isArray(subject_assignments)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { error } = await adminClient.rpc("assign_faculty_academic_load", {
    p_faculty_id: faculty_id,
    p_advisory_section_id: advisory_section_id ?? null,
    p_subject_assignments: subject_assignments,
  });

  if (error) {
    console.error("assign_faculty_academic_load error:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  // Sync JWT claims — assign_faculty_academic_load now grants the Faculty role
  syncUserPermissions(faculty_id).catch((err) =>
    console.error("syncUserPermissions failed after assign-load:", err),
  );

  return Response.json({ success: true }, { status: 200 });
}

export const POST = withErrorHandler(_POST)
