import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
interface AssignAdviserBody {
  section_id?: number;
  adviser_id?: string | null;
}

const _POST = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(caller);
  if (!permissions.includes("classes.full_access")) {
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


  // Unassigning: plain overwrite is fine (last-write-wins on null is idempotent)
  if (adviserId === null || adviserId === "") {
    const { error } = await adminClient.rpc("set_section_adviser", {
      p_section_id: sectionId,
      p_adviser_id: null,
    });
    if (error) {
      return Response.json(
        { error: "Failed to unassign class adviser." },
        { status: 500 },
      );
    }
    return Response.json({ success: true }, { status: 200 });
  }

  // Assigning: use the safe RPC that locks rows and validates all invariants
  const { error } = await adminClient.rpc("assign_section_adviser", {
    p_section_id: sectionId,
    p_adviser_id: adviserId,
  });

  if (error) {
    const msg: string = error.message ?? "";
    if (msg.includes("Section already has an adviser") ||
        msg.includes("already has an advisory section") ||
        msg.includes("concurrent update")) {
      return Response.json({ error: msg }, { status: 409 });
    }
    if (msg.includes("not faculty")) {
      return Response.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("not found") || msg.includes("inactive")) {
      return Response.json({ error: msg }, { status: 404 });
    }
    return Response.json(
      { error: "Failed to assign class adviser." },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}

export const POST = withErrorHandler(_POST)
