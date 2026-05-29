import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { buildSectionCardsForSy } from "@/app/(app)/school/classes/_lib/classesServerService";

const _GET = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const syId = Number(new URL(request.url).searchParams.get("syId"));
  if (!syId) {
    return Response.json(
      { error: "Missing syId parameter." },
      { status: 400 },
    );
  }

  const { sections, assignedSectionIds } = await buildSectionCardsForSy(syId, user.id);
  return Response.json({ sections, assignedSectionIds });
};

export const GET = withErrorHandler(_GET);
