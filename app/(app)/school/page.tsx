import ProtectedRoute from "@/components/ProtectedRoute";

export default function School() {
  return (
    <ProtectedRoute requiredPermissions={["access_school_management"]}>
      <h1>School</h1>
    </ProtectedRoute>
  );
}
