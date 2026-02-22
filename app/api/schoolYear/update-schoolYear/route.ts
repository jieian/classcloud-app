import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  // 1. Verify the caller is authenticated
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
      (p: any) => p.permission_name === "access_year_management",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Parse payload
  const body = await request.json();
  const { sy_id, start_year, end_year, is_active, quarters } = body;

  if (
    sy_id == null ||
    start_year == null ||
    end_year == null ||
    is_active == null ||
    !Array.isArray(quarters)
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. Single atomic RPC call (includes uniqueness check inside the function)
  const { error } = await adminClient.rpc("update_school_year", {
    p_sy_id: sy_id,
    p_start_year: start_year,
    p_end_year: end_year,
    p_is_active: is_active,
    p_quarters: quarters,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A school year with this range already exists." },
        { status: 409 },
      );
    }
    console.error("School year update failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
