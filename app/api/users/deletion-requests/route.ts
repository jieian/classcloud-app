import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// Admin queue of PENDING account-deletion requests. Gated on the users.full_access
// permission string. Service-role reads only; index-supported (status, requested_at).
const PAGE = 100;

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Exact pending count for the badge (head request — no rows transferred).
  const { count } = await admin
    .from("account_deletion_requests")
    .select("request_id", { count: "exact", head: true })
    .eq("status", "PENDING");

  // Fetch one extra to flag truncation; requester_email is still present for PENDING rows.
  const { data: rows, error } = await admin
    .from("account_deletion_requests")
    .select("request_id, uid, reason, requested_at, requester_email")
    .eq("status", "PENDING")
    .order("requested_at", { ascending: true })
    .limit(PAGE + 1);

  if (error) {
    console.error("[deletion-requests] list error:", error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const overLimit = (rows?.length ?? 0) > PAGE;
  const page = (rows ?? []).slice(0, PAGE);

  // Requester display names in one query.
  const uids = [...new Set(page.map((r) => r.uid as string))];
  const nameMap = new Map<string, string>();
  if (uids.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("uid, first_name, last_name")
      .in("uid", uids);
    for (const u of users ?? []) {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
      nameMap.set(u.uid as string, name || "a former user");
    }
  }

  const requests = page.map((r) => ({
    request_id: r.request_id as string,
    uid: r.uid as string,
    requester_name: nameMap.get(r.uid as string) ?? "a former user",
    requester_email: (r.requester_email as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    requested_at: r.requested_at as string,
  }));

  return Response.json({
    requests,
    pendingCount: count ?? requests.length,
    over_limit: overLimit,
  });
};

export const GET = withErrorHandler(_GET);
