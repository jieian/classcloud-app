export interface AuditLogRow {
  audit_id: string;
  actor_id: string | null;
  actor_name: string | null;
  category: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogsParams {
  page?: number;
  category?: string;
  date_from?: string;
  date_to?: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAuditLogs(params: AuditLogsParams = {}): Promise<AuditLogsResponse> {
  const sp = new URLSearchParams();
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  if (params.category) sp.set("category", params.category);
  if (params.date_from) sp.set("date_from", params.date_from);
  if (params.date_to) sp.set("date_to", params.date_to);

  const qs = sp.toString();
  const res = await fetch(`/api/audit-logs${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch audit logs");
  }
  return res.json() as Promise<AuditLogsResponse>;
}
