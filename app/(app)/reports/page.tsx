import ProtectedRoute from "@/components/ProtectedRoute";

export default function Reports() {
  return (
    <ProtectedRoute requiredPermissions={["access_reports"]}>
      <h1>Reports</h1>
    </ProtectedRoute>
  );
}
