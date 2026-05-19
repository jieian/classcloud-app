import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "./_components/ReportAnalyticsClient";

export default function ReportAnalyticsPage() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "reports.view_all",
        "reports.view_assigned",
        "reports.monitor_grade_level",
        "reports.monitor_subjects",
        "reports.approve",
      ]}
    >
      <ReportAnalyticsClient />
    </ProtectedRoute>
  );
}
