import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
const _POST = async function(request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });


  // .select() returns the inserted id in the same round trip (no extra read).
  const { data: created, error } = await admin
    .from("curriculums")
    .insert({ name, description: body.description ?? null })
    .select("curriculum_id")
    .single();

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  revalidateTag("subjects", "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "curriculum_created",
      entity_type: "curriculum",
      entity_id: String(created?.curriculum_id ?? ""),
      entity_label: name,
      new_values: { name },
    }).catch(() => {}),
  );

  return Response.json({ success: true }, { status: 201 });
}

export const POST = withErrorHandler(_POST)
