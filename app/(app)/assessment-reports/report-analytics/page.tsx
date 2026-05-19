import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "./_components/ReportAnalyticsClient";

export default function ReportAnalyticsPage() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all"]}
    >
      <ReportAnalyticsClient />
    </ProtectedRoute>
  );
}
