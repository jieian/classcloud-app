import ProtectedRoute from "@/components/ProtectedRoute";

export default function Faculty() {
  return (
    <ProtectedRoute requiredPermissions={["access_faculty_management"]}>
      <h1>Faculty</h1>
    </ProtectedRoute>
  );
}
