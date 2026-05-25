import ProtectedRoute from "@/components/ProtectedRoute";
import SubjectReportsBrowser from "./_components/SubjectReportsBrowser";

export default function SubjectReportsPage() {
  return (
    <ProtectedRoute match="any" requiredPermissions={["reports.view_all"]}>
      <SubjectReportsBrowser />
    </ProtectedRoute>
  );
}
