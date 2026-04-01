import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";
import { getClassesInitData } from "@/app/(app)/school/classes/_lib/classesServerService";

import { withErrorHandler } from "@/lib/api-error";

const _GET = async function() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const data = await getClassesInitData(user.id, permissions);
  return Response.json(data);
}

export const GET = withErrorHandler(_GET)
