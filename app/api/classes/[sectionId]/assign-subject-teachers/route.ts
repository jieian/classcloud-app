import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const body = (await request.json()) as {
    assignments: { subject_id: number; teacher_id: string | null }[];
  };

  if (!Array.isArray(body.assignments))
    return Response.json({ error: "Invalid payload." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Fetch the section's sy_id
  const { data: sectionData, error: sectionError } = await admin
    .from("sections")
    .select("sy_id")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (sectionError)
    return Response.json({ error: sectionError.message }, { status: 500 });
  if (!sectionData)
    return Response.json({ error: "Section not found." }, { status: 404 });

  const syId = (sectionData as { sy_id: number }).sy_id;

  // Single atomic RPC — delete + re-insert in one transaction
  const { error } = await admin.rpc("set_section_subject_teachers", {
    p_section_id: sectionId,
    p_sy_id: syId,
    p_assignments: body.assignments,
  });

  if (error)
    return Response.json(
      { error: error.message || "Failed to update subject teacher assignments." },
      { status: 500 },
    );

  return Response.json({ success: true });
}
