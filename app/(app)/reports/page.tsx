import ProtectedRoute from "@/components/ProtectedRoute";

export default function Reports() {
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
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Reports</h1>
    </ProtectedRoute>
  );
}
