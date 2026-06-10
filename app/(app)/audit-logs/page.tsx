import { redirect } from "next/navigation";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import { fetchInitialAuditLogs } from "./_lib/auditLogsServerService";
import AuditLogsClient from "./_components/AuditLogsClient";

export default async function AuditLogsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  const permissions = getPermissionsFromUser(user);
  const hasViewAll = permissions.includes("audit_logs.view_all");
  const hasViewOwn = permissions.includes("audit_logs.view_own");

  if (!hasViewAll && !hasViewOwn) redirect("/unauthorized");

  const { logs, total } = await fetchInitialAuditLogs(user.id, hasViewAll);

  return (
    <ProtectedRoute
      requiredPermissions={["audit_logs.view_all", "audit_logs.view_own"]}
      match="any"
    >
      <AuditLogsClient initialLogs={logs} initialTotal={total} hasViewAll={hasViewAll} />
    </ProtectedRoute>
  );
}
