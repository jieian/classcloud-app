import ProtectedRoute from "@/components/ProtectedRoute";

export default function itemAnalysis() {
  return (
    <ProtectedRoute requiredPermissions={["access_reports"]}>
      <h1>Item Analysis</h1>
    </ProtectedRoute>
  );
}
