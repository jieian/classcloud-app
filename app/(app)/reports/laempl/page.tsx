import ProtectedRoute from "@/components/ProtectedRoute";

export default function LAEMPL() {
  return (
    <ProtectedRoute requiredPermissions={["access_reports"]}>
      <h1>LAEMPL</h1>
    </ProtectedRoute>
  );
}
