import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  // 1. Verify caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Admin client — bypasses RLS
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  // 3. Permission check
  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: caller.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: { permission_name: string }) =>
        p.permission_name === "access_subject_management",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Parse payload
  const body = await request.json();
  const { subject_id, code, name, description, grade_level_ids } = body;

  const subjectId = parseInt(String(subject_id), 10);
  if (isNaN(subjectId) || subjectId <= 0) {
    return Response.json({ error: "Invalid subject_id" }, { status: 400 });
  }

  if (!code?.trim() || !name?.trim() || !description?.trim()) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. Atomic RPC — duplicate check + update + grade level replacement in one transaction
  // The duplicate check (excluding this subject) is handled inside the RPC itself
  const { error } = await adminClient.rpc("update_subject_with_grade_levels", {
    p_subject_id: subjectId,
    p_code: code.trim(),
    p_name: name.trim(),
    p_description: description.trim(),
    p_grade_level_ids: Array.isArray(grade_level_ids) ? grade_level_ids : [],
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A subject with this code already exists." },
        { status: 409 },
      );
    }
    console.error("Subject update failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
