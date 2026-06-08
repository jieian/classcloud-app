import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { getClassesInitData } from "@/app/(app)/school/classes/_lib/classesServerService";

import { withErrorHandler } from "@/lib/api-error";

const _GET = async function() {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const data = await getClassesInitData(user.id);
  return Response.json(data);
}

export const GET = withErrorHandler(_GET)
