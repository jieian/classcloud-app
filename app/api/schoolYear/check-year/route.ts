import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { withErrorHandler } from "@/lib/api-error";

const _GET = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startYearStr = url.searchParams.get("start_year");
  const startYear = startYearStr ? parseInt(startYearStr, 10) : NaN;

  if (isNaN(startYear) || startYear < 2000 || startYear > 2100) {
    return Response.json({ error: "Invalid start_year" }, { status: 400 });
  }

  const { count, error } = await adminClient
    .from("school_years")
    .select("sy_id", { count: "exact", head: true })
    .eq("start_year", startYear)
    .is("deleted_at", null);

  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return Response.json(
      { error: "School year already exists." },
      { status: 409 }
    );
  }

  return Response.json({ available: true }, { status: 200 });
};

export const GET = withErrorHandler(_GET);
