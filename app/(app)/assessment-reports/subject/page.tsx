import ProtectedRoute from "@/components/ProtectedRoute";
import SubjectReportsBrowser from "./_components/SubjectReportsBrowser";

export default function SubjectReportsPage() {
  return (
    <ProtectedRoute match="any" requiredPermissions={["reports.view_all", "reports.view_assigned", "reports.monitor_grade_level", "reports.monitor_subjects", "reports.approve"]}>
      <SubjectReportsBrowser />
    </ProtectedRoute>
  );
}
