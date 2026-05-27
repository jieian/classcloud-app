import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getReportExamCardsCached } from "@/app/(app)/reports/_lib/reportServerService";

const _GET = async function () {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json([], { status: 401 });

  const cards = await getReportExamCardsCached();
  return Response.json(cards);
};

export const GET = withErrorHandler(_GET);
