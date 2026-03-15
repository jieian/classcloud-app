import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lrn: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { lrn: oldLrn } = await params;
  if (!oldLrn)
    return Response.json({ error: "Invalid LRN." }, { status: 400 });

  const body = (await request.json()) as {
    lrn: string;
    last_name: string;
    first_name: string;
    middle_name: string;
    sex: string;
  };

  const newLrn = (body.lrn ?? "").trim();
  const lastName = (body.last_name ?? "").trim();
  const firstName = (body.first_name ?? "").trim();
  const middleName = (body.middle_name ?? "").trim();
  const sex = (body.sex ?? "").trim();

  if (!/^\d{12}$/.test(newLrn))
    return Response.json(
      { error: "LRN must be exactly 12 numeric digits." },
      { status: 400 },
    );
  if (!lastName || lastName.length < 2)
    return Response.json({ error: "Last name is required (min 2 chars)." }, { status: 400 });
  if (!firstName || firstName.length < 2)
    return Response.json({ error: "First name is required (min 2 chars)." }, { status: 400 });
  if (!["M", "F"].includes(sex))
    return Response.json({ error: "Sex must be M or F." }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // If LRN is changing, ensure the new one isn't taken
  if (newLrn !== oldLrn) {
    const { data: existing } = await admin
      .from("students")
      .select("lrn")
      .eq("lrn", newLrn)
      .maybeSingle();

    if (existing)
      return Response.json(
        { error: `LRN ${newLrn} is already in use by another student.` },
        { status: 409 },
      );
  }

  const { error } = await admin.rpc("update_student_info", {
    p_old_lrn: oldLrn,
    p_new_lrn: newLrn,
    p_last_name: lastName,
    p_first_name: firstName,
    p_middle_name: middleName,
    p_sex: sex,
  });

  if (error)
    return Response.json(
      { error: error.message || "Failed to update student." },
      { status: 500 },
    );

  return Response.json({ success: true });
}
