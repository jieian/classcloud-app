import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

interface AssignAdviserBody {
  section_id?: number;
  adviser_id?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("access_classes_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as AssignAdviserBody;
  const sectionId = Number(body.section_id);
  const adviserId =
    body.adviser_id === null ? null : (body.adviser_id ?? "").trim();

  if (!sectionId || (body.adviser_id !== null && !adviserId)) {
    return Response.json(
      { error: "Missing required fields: section_id and adviser_id." },
      { status: 400 },
    );
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await adminClient.rpc("set_section_adviser", {
    p_section_id: sectionId,
    p_adviser_id: adviserId,
  });

  if (error) {
    return Response.json(
      { error: error.message || "Failed to assign class adviser." },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}
