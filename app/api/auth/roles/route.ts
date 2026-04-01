import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _GET = async function() {

  const { data, error } = await adminClient
    .from("roles")
    .select("role_id, name, is_faculty")
    .eq("is_self_registerable", true)
    .order("name");

  if (error) {
    return Response.json({ error: "Failed to load roles." }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}

export const GET = withErrorHandler(_GET)
