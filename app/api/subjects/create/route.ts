import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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
  const { code, name, description, grade_level_ids } = body;

  if (!code?.trim() || !name?.trim() || !description?.trim()) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. Duplicate subject code check (case-insensitive, exclude soft-deleted)
  const { count: dupCount, error: dupError } = await adminClient
    .from("subjects")
    .select("subject_id", { count: "exact", head: true })
    .ilike("code", code.trim())
    .is("deleted_at", null);

  if (dupError) {
    return Response.json({ error: dupError.message }, { status: 500 });
  }
  if ((dupCount ?? 0) > 0) {
    return Response.json(
      { error: "A subject with this code already exists." },
      { status: 409 },
    );
  }

  // 6. Atomic RPC — inserts subject + grade level links in one transaction
  const { data, error } = await adminClient.rpc(
    "create_subject_with_grade_levels",
    {
      p_code: code.trim(),
      p_name: name.trim(),
      p_description: description.trim(),
      p_grade_level_ids: Array.isArray(grade_level_ids) ? grade_level_ids : [],
    },
  );

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A subject with this code already exists." },
        { status: 409 },
      );
    }
    console.error("Subject creation failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true, subject_id: data }, { status: 201 });
}
