import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { SCHOOL_YEARS_CACHE_TAG } from "@/app/(app)/school/classes/_lib/classesServerService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _PUT = async function(request: Request) {
  // 1. Verify the caller is authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Permission check
  if (!getPermissionsFromUser(caller).includes("school_year.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Parse payload
  const body = await request.json();
  const { sy_id, start_year, end_year, is_active, quarters } = body;

  if (
    sy_id == null ||
    start_year == null ||
    end_year == null ||
    is_active == null ||
    !Array.isArray(quarters)
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 5. Duplicate check — exclude soft-deleted rows and the current record
  const { count: dupCount, error: dupError } = await adminClient
    .from("school_years")
    .select("sy_id", { count: "exact", head: true })
    .eq("start_year", start_year)
    .is("deleted_at", null)
    .neq("sy_id", sy_id);

  if (dupError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if ((dupCount ?? 0) > 0) {
    return Response.json(
      { error: "A school year with this range already exists." },
      { status: 409 },
    );
  }

  // 6. If activating, capture other currently active school years before the RPC
  //    so we can deactivate their quarters afterward.
  let otherActiveYearIds: number[] = [];
  if (is_active) {
    const { data: activeYears } = await adminClient
      .from("school_years")
      .select("sy_id")
      .eq("is_active", true)
      .neq("sy_id", sy_id);
    otherActiveYearIds = (activeYears ?? []).map((y: { sy_id: number }) => y.sy_id);
  }

  // 7. Single atomic RPC call
  const { error } = await adminClient.rpc("update_school_year", {
    p_sy_id: sy_id,
    p_start_year: start_year,
    p_end_year: end_year,
    p_is_active: is_active,
    p_quarters: quarters,
  });

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A school year with this range already exists." },
        { status: 409 },
      );
    }
    console.error("School year update failed:", error.message);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }

  // 8. Deactivate quarters of the previously active school years
  if (otherActiveYearIds.length > 0) {
    await adminClient
      .from("quarters")
      .update({ is_active: false })
      .in("sy_id", otherActiveYearIds);
  }

  revalidateTag(SCHOOL_YEARS_CACHE_TAG, "minutes");
  return Response.json({ success: true }, { status: 200 });
}

export const PUT = withErrorHandler(_PUT)
