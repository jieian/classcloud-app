import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: user.id },
  );

  if (
    permsError ||
    !permsData?.some(
      (p: any) =>
        p.permission_name === "full_access_examinations" ||
        p.permission_name === "partial_access_examinations",
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const examId = Number(body?.exam_id);

  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: "Invalid exam_id." }, { status: 400 });
  }

  const { error } = await adminClient
    .from("exams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("exam_id", examId)
    .is("deleted_at", null);

  if (error) {
    console.error("[api/exams/delete] delete exam error:", error.message);
    return Response.json(
      { error: error.message || "Failed to delete exam." },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
