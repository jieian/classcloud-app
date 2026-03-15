import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasFullAccess = permissions.includes("students.full_access");
  const hasPartialAccess = permissions.includes(
    "students.limited_access",
  );
  if (!hasFullAccess && !hasPartialAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { section_id?: number; lrn?: string };
  const sectionId = Number(body.section_id);
  const lrn = (body.lrn ?? "").trim();

  if (!sectionId || !/^\d{12}$/.test(lrn)) {
    return Response.json(
      { error: "Invalid section ID or LRN." },
      { status: 400 },
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Partial-access users can only delete from sections they advise.
  if (!hasFullAccess) {
    const { data: section, error: secErr } = await admin
      .from("sections")
      .select("adviser_id")
      .eq("section_id", sectionId)
      .is("deleted_at", null)
      .maybeSingle();

    if (secErr) {
      return Response.json({ error: secErr.message }, { status: 500 });
    }
    if (!section || section.adviser_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: student, error: studentErr } = await admin
    .from("students")
    .select("lrn")
    .eq("lrn", lrn)
    .is("deleted_at", null)
    .maybeSingle();

  if (studentErr) {
    return Response.json({ error: studentErr.message }, { status: 500 });
  }
  if (!student) {
    return Response.json({ error: "Student not found." }, { status: 404 });
  }

  const { error } = await admin.rpc("soft_delete_student", {
    p_lrn: lrn,
  });

  if (error) {
    return Response.json(
      { error: error.message || "Failed to delete student." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
