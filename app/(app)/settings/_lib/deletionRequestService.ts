/**
 * Client helpers for the data-subject account-deletion request flow (RA 10173).
 * All reads/writes go through the server route; the table itself is service-role-only.
 */

export type DeletionRequestStatus =
  | "PENDING"
  | "APPROVING"
  | "APPROVED"
  | "DENIED"
  | "WITHDRAWN";

export interface MyDeletionRequest {
  status: DeletionRequestStatus;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

/** Raised when the session is gone (e.g. the account was just erased). */
export class SessionEndedError extends Error {}

export async function fetchMyDeletionRequest(): Promise<MyDeletionRequest | null> {
  const res = await fetch("/api/settings/deletion-request");
  if (res.status === 401) throw new SessionEndedError();
  if (!res.ok) throw new Error("Failed to load your request status.");
  const json = (await res.json()) as { request: MyDeletionRequest | null };
  return json.request;
}

export async function submitDeletionRequest(reason?: string): Promise<void> {
  const res = await fetch("/api/settings/deletion-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? undefined }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to submit your request.");
  }
}

export async function withdrawDeletionRequest(): Promise<void> {
  const res = await fetch("/api/settings/deletion-request", { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to withdraw your request.");
  }
}
