import { revalidateTag } from "next/cache";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { CURRICULUM_CACHE_TAG } from "@/app/(app)/school/curriculum/_lib/curriculumServerService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
const _DELETE = async function(request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("curriculum.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const curriculumId = Number(body?.curriculum_id);
  if (!curriculumId || isNaN(curriculumId))
    return Response.json({ error: "Invalid curriculum ID." }, { status: 400 });


  const { data, error } = await admin.rpc("delete_curriculum", {
    p_curriculum_id: curriculumId,
  });

  if (error) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (data?.success === false)
    return Response.json({ error: data.message ?? "Failed to delete curriculum." }, { status: 409 });

  revalidateTag(CURRICULUM_CACHE_TAG, "minutes");
  revalidateTag("subjects", "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "curriculum_deleted",
      entity_type: "curriculum",
      entity_id: String(curriculumId),
      // name deferred — delete_curriculum _audit.
    }).catch(() => {}),
  );

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
