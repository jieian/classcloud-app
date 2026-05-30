import ProtectedRoute from "@/components/ProtectedRoute";
import ReportsBrowser from "./_components/ReportsBrowser";

export default function ReportsPage() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all", "reports.view_assigned", "reports.monitor_grade_level", "reports.monitor_subjects"]}
    >
      <ReportsBrowser />
    </ProtectedRoute>
  );
}
