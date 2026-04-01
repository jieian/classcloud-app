import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── GET /api/settings/profile ───────────────────────────────────────────────
const _GET = async function() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });


  // Email is already on the verified session user — no extra roundtrip needed.
  const email = user.email ?? "";

  const { data, error: profileError } = await admin
    .from("users")
    .select("first_name, middle_name, last_name, user_roles(role_id, roles(role_id, name))")
    .eq("uid", user.id)
    .eq("active_status", 1)
    .is("deleted_at", null)
    .single();

  if (profileError || !data)
    return Response.json({ error: "Profile not found." }, { status: 404 });

  const raw = data as any;

  const roles = ((raw.user_roles ?? []) as any[])
    .map((ur: any) => {
      const role = Array.isArray(ur.roles) ? ur.roles[0] : ur.roles;
      return { role_id: ur.role_id as number, name: (role?.name ?? "") as string };
    })
    .filter((r) => r.name);

  return Response.json({
    profile: {
      first_name: (raw.first_name ?? "") as string,
      middle_name: (raw.middle_name ?? "") as string,
      last_name: (raw.last_name ?? "") as string,
      email,
      roles,
    },
  });
}

// ─── PATCH /api/settings/profile ─────────────────────────────────────────────
const _PATCH = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  };

  const firstName = toTitleCase(body.first_name?.trim() ?? "");
  const middleName = body.middle_name?.trim()
    ? toTitleCase(body.middle_name.trim())
    : "";
  const lastName = toTitleCase(body.last_name?.trim() ?? "");

  if (!firstName || !lastName) {
    return Response.json(
      { error: "First name and last name are required." },
      { status: 400 },
    );
  }

  // Use the user-scoped client so auth.uid() resolves correctly inside the RPC.
  const { error } = await supabase.rpc("update_my_profile", {
    p_first_name: firstName,
    p_middle_name: middleName,
    p_last_name: lastName,
  });

  if (error) {
    if (error.message.includes("USER_NOT_FOUND"))
      return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({
    success: true,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
  });
}

export const GET = withErrorHandler(_GET)
export const PATCH = withErrorHandler(_PATCH)
