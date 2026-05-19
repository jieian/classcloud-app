import ProtectedRoute from "@/components/ProtectedRoute";
import AssessmentReportsBrowser from "./_components/AssessmentReportsBrowser";

export default function AssessmentReports() {
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
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Assessment Reports
      </h1>
      <AssessmentReportsBrowser />
    </ProtectedRoute>
  );
}
