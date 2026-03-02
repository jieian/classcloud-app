import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("access_classes_management"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const gradeLevelId = Number(body.grade_level_id);
  const sectionType = body.section_type as string;

  if (!name)
    return Response.json({ error: "Class name is required." }, { status: 400 });
  if (name.length > 50)
    return Response.json(
      { error: "Class name must be 50 characters or less." },
      { status: 400 },
    );
  if (!/^[A-Za-z0-9][A-Za-z0-9\s\-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/.test(name))
    return Response.json(
      { error: "Class name must not contain symbols and must start and end with a letter or number." },
      { status: 400 },
    );
  if (/--/.test(name))
    return Response.json(
      { error: "Class name cannot have consecutive hyphens." },
      { status: 400 },
    );
  if (!gradeLevelId)
    return Response.json({ error: "Grade level is required." }, { status: 400 });
  if (!["REGULAR", "SSES"].includes(sectionType))
    return Response.json({ error: "Invalid section type." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve active school year
  const { data: syData, error: syError } = await admin
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (syError)
    return Response.json({ error: syError.message }, { status: 500 });
  if (!syData)
    return Response.json(
      { error: "No active school year found. Please set an active school year first." },
      { status: 400 },
    );

  const { data: result, error: rpcError } = await admin.rpc(
    "create_section_atomic",
    {
      p_name: name,
      p_grade_level_id: gradeLevelId,
      p_section_type: sectionType,
      p_sy_id: syData.sy_id,
    },
  );

  if (rpcError)
    return Response.json({ error: rpcError.message }, { status: 500 });

  if (!result?.success) {
    const msg: string = result?.error ?? "Failed to create class.";
    const isConflict =
      msg.includes("already exists");
    return Response.json({ error: msg }, { status: isConflict ? 409 : 500 });
  }

  return Response.json(
    { success: true, section_id: result.section_id },
    { status: 201 },
  );
}
