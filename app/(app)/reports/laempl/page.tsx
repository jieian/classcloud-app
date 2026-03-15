import ProtectedRoute from "@/components/ProtectedRoute";

export default function LAEMPL() {
  return (
    <ProtectedRoute requiredPermissions={["reports.view_all"]}>
      <h1>LAEMPL</h1>
    </ProtectedRoute>
  );
}
