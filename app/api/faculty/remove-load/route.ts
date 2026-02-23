import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Permission check
  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: caller.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: any) => p.permission_name === "access_faculty_management",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { faculty_id } = body;

  if (!faculty_id) {
    return Response.json({ error: "Missing faculty_id" }, { status: 400 });
  }

  // Fetch active school year
  const { data: syData } = await adminClient
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!syData?.sy_id) {
    return Response.json({ error: "No active school year found" }, { status: 400 });
  }

  const { error } = await adminClient.rpc("remove_faculty_academic_load", {
    p_faculty_id: faculty_id,
    p_sy_id: syData.sy_id,
  });

  if (error) {
    console.error("remove_faculty_academic_load error:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
