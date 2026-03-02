import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

// ─── POST /api/classes/transfer-requests ──────────────────────────────────────
// Creates a transfer request via the atomic Postgres RPC.
// Only partial_access advisers may call this; the RPC validates adviser ownership.

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  if (!permissions.includes("partial_access_student_management"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    lrn?: string;
    from_section_id?: number;
    to_section_id?: number;
  };

  const lrn = (body.lrn ?? "").trim();
  const fromSectionId = Number(body.from_section_id ?? 0);
  const toSectionId = Number(body.to_section_id ?? 0);

  if (!/^\d{12}$/.test(lrn))
    return Response.json({ error: "Invalid LRN." }, { status: 400 });
  if (!fromSectionId || !toSectionId)
    return Response.json({ error: "Missing section IDs." }, { status: 400 });
  if (fromSectionId === toSectionId)
    return Response.json(
      { error: "Cannot transfer to the same section." },
      { status: 400 },
    );

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: requestId, error } = await admin.rpc("create_transfer_request", {
    p_lrn: lrn,
    p_from_section_id: fromSectionId,
    p_to_section_id: toSectionId,
    p_requested_by: user.id,
  });

  if (error) {
    if (error.message.includes("ALREADY_PENDING"))
      return Response.json({ error: "ALREADY_PENDING" }, { status: 409 });
    if (error.message.includes("NOT_ENROLLED"))
      return Response.json({ error: "NOT_ENROLLED" }, { status: 422 });
    if (error.message.includes("NOT_ADVISER"))
      return Response.json({ error: "NOT_ADVISER" }, { status: 403 });
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ request_id: requestId }, { status: 201 });
}

// ─── GET /api/classes/transfer-requests ───────────────────────────────────────
// ?type=incoming  → all statuses for sections where user is adviser
// ?type=outgoing  → all statuses for requests the user submitted
// (no type)       → PENDING incoming only (backward-compat for inbox)

const BASE_SELECT = `
  request_id, lrn, status,
  from_section_id, to_section_id,
  requested_at, expires_at, reviewed_at, notes, cancellation_reason,
  student:students(full_name, sex),
  from_section:sections!from_section_id(
    name,
    grade_levels(display_name),
    adviser:users!adviser_id(first_name, last_name)
  ),
  to_section:sections!to_section_id(name, grade_levels(display_name)),
  requester:users!requested_by(first_name, last_name)
`;

function mapRow(r: any) {
  const student = Array.isArray(r.student) ? r.student[0] : r.student;
  const fromSec = Array.isArray(r.from_section) ? r.from_section[0] : r.from_section;
  const toSec = Array.isArray(r.to_section) ? r.to_section[0] : r.to_section;
  const requester = Array.isArray(r.requester) ? r.requester[0] : r.requester;
  const fromGl = Array.isArray(fromSec?.grade_levels)
    ? fromSec.grade_levels[0]
    : fromSec?.grade_levels;
  const toGl = Array.isArray(toSec?.grade_levels)
    ? toSec.grade_levels[0]
    : toSec?.grade_levels;
  const adviser = Array.isArray(fromSec?.adviser)
    ? fromSec.adviser[0]
    : fromSec?.adviser;

  return {
    request_id: r.request_id as string,
    lrn: r.lrn as string,
    status: r.status as string,
    from_section_id: r.from_section_id as number,
    to_section_id: r.to_section_id as number,
    requested_at: r.requested_at as string,
    expires_at: r.expires_at as string,
    reviewed_at: (r.reviewed_at ?? null) as string | null,
    notes: (r.notes ?? null) as string | null,
    cancellation_reason: (r.cancellation_reason ?? null) as string | null,
    student_full_name: (student?.full_name ?? "") as string,
    student_sex: (student?.sex ?? "M") as "M" | "F",
    from_section_name: (fromSec?.name ?? "") as string,
    from_grade_level_display: (fromGl?.display_name ?? "") as string,
    from_adviser_name: adviser
      ? (`${adviser.first_name ?? ""} ${adviser.last_name ?? ""}`.trim() || null)
      : null,
    to_section_name: (toSec?.name ?? "") as string,
    to_grade_level_display: (toGl?.display_name ?? "") as string,
    requester_name: requester
      ? `${requester.first_name ?? ""} ${requester.last_name ?? ""}`.trim()
      : "",
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getUserPermissions(user.id);
  const hasStudentAccess =
    permissions.includes("full_access_student_management") ||
    permissions.includes("partial_access_student_management");
  if (!hasStudentAccess)
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "incoming" | "outgoing" | null

  // ── Outgoing: requests this user submitted ─────────────────────────────────
  if (type === "outgoing") {
    const { data: raw, error } = await admin
      .from("section_transfer_requests")
      .select(BASE_SELECT)
      .eq("requested_by", user.id)
      .order("requested_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ requests: ((raw ?? []) as any[]).map(mapRow) });
  }

  // ── Incoming: requests for sections where user is adviser ──────────────────
  // Covers both type=incoming (all statuses) and no-type (PENDING only, backward compat)
  const { data: advisedSections } = await admin
    .from("sections")
    .select("section_id")
    .eq("adviser_id", user.id)
    .is("deleted_at", null);

  const advisedIds = ((advisedSections ?? []) as any[]).map(
    (s) => s.section_id as number,
  );

  if (advisedIds.length === 0) {
    return Response.json({ requests: [] });
  }

  let query = admin
    .from("section_transfer_requests")
    .select(BASE_SELECT)
    .in("from_section_id", advisedIds);

  if (!type) {
    // Backward-compat: no type param → PENDING only, ordered oldest first
    query = query.eq("status", "PENDING").order("requested_at", { ascending: true });
  } else {
    // type=incoming → all statuses, PENDING first then newest first
    query = query.order("requested_at", { ascending: false });
  }

  const { data: raw, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let requests = ((raw ?? []) as any[]).map(mapRow);

  // For type=incoming, sort: PENDING first, then by requested_at DESC
  if (type === "incoming") {
    requests = requests.sort((a, b) => {
      if (a.status === "PENDING" && b.status !== "PENDING") return -1;
      if (a.status !== "PENDING" && b.status === "PENDING") return 1;
      return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    });
  }

  return Response.json({ requests });
}
