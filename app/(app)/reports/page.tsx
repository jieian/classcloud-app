import ProtectedRoute from "@/components/ProtectedRoute";

export default function Reports() {
  return (
    <ProtectedRoute requiredPermissions={["reports.view_all"]}>
      <h1>Reports</h1>
    </ProtectedRoute>
  );
}
