import ProtectedRoute from "@/components/ProtectedRoute";

export default function itemAnalysis() {
  return (
    <ProtectedRoute requiredPermissions={["reports.view_all"]}>
      <h1>Item Analysis</h1>
    </ProtectedRoute>
  );
}
