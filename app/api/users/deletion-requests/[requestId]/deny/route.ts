import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { insertAuditLog } from "@/lib/audit";
import { dispatchDeletionRequestDenied } from "@/lib/notifications";
import { after } from "next/server";

const CATEGORIES = ["legal_retention", "active_legal_claim", "still_necessary", "other"];

// Deny a deletion request with a required, substantive reason (RA 10173: erasure is a
// qualified right the PIC may lawfully refuse). The reason is communicated to the subject.
const _POST = async function (
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("users.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;

  const { data: req } = await admin
    .from("account_deletion_requests")
    .select("uid, status")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!req) return Response.json({ error: "Request not found." }, { status: 404 });

  if ((req.uid as string) === user.id) {
    return Response.json(
      { error: "You cannot deny your own deletion request." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const category = typeof body?.category === "string" ? body.category : "";
  const note = typeof body?.decision_note === "string" ? body.decision_note.trim() : "";
  const internalNote =
    typeof body?.internal_note === "string" && body.internal_note.trim()
      ? body.internal_note.trim()
      : null;

  if (!CATEGORIES.includes(category)) {
    return Response.json({ error: "A valid reason category is required." }, { status: 400 });
  }
  if (note.length < 10 || note.length > 1000) {
    return Response.json(
      { error: "The reason must be between 10 and 1000 characters." },
      { status: 400 },
    );
  }
  if (category === "other" && note.length < 30) {
    return Response.json(
      { error: "For 'Other', please provide a fuller justification (at least 30 characters)." },
      { status: 400 },
    );
  }
  if (internalNote && internalNote.length > 2000) {
    return Response.json(
      { error: "The internal note must be 2000 characters or fewer." },
      { status: 400 },
    );
  }

  // Atomic decision; capture the requester email before nulling it.
  const { data: denied } = await admin
    .from("account_deletion_requests")
    .update({
      status: "DENIED",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      denial_category: category,
      decision_note: note,
      internal_note: internalNote,
    })
    .eq("request_id", requestId)
    .eq("status", "PENDING")
    .select("requester_email");

  if (!denied || denied.length === 0) {
    return Response.json({ error: "This request is no longer pending." }, { status: 409 });
  }

  const requesterEmail = (denied[0]?.requester_email as string | null) ?? null;

  // Immediately + unconditionally null the address so a DENIED row never retains PII,
  // regardless of whether the notification email later succeeds.
  await admin
    .from("account_deletion_requests")
    .update({ requester_email: null })
    .eq("request_id", requestId);

  after(() =>
    dispatchDeletionRequestDenied({ requestId, requesterEmail, decisionNote: note }),
  );

  insertAuditLog({
    actor_id: user.id,
    action: "deletion_request_denied",
    entity_type: "user",
    entity_id: req.uid as string,
    metadata: { denial_category: category },
  }).catch(() => {});

  return Response.json({ success: true });
};

export const POST = withErrorHandler(_POST);
