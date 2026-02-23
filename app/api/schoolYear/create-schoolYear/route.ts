import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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
  const { start_year, end_year } = body;

  if (start_year == null || end_year == null) {
    return Response.json(
      { error: "Missing required fields: start_year, end_year" },
      { status: 400 },
    );
  }

  // 5. Duplicate check — exclude soft-deleted rows
  const { count: dupCount, error: dupError } = await adminClient
    .from("school_years")
    .select("sy_id", { count: "exact", head: true })
    .eq("start_year", start_year)
    .is("deleted_at", null);

  if (dupError) {
    return Response.json({ error: dupError.message }, { status: 500 });
  }
  if ((dupCount ?? 0) > 0) {
    return Response.json(
      { error: "A school year with this range already exists." },
      { status: 409 },
    );
  }

  // 6. Atomic RPC — creates school year + 4 quarters in one transaction
  const { error } = await adminClient.rpc("create_school_year", {
    p_start_year: start_year,
    p_end_year: end_year,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A school year with this range already exists." },
        { status: 409 },
      );
    }
    console.error("School year creation failed:", error.message);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 201 });
}
