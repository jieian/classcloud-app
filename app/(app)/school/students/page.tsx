import ProtectedRoute from "@/components/ProtectedRoute";

export default function Students() {
  return (
    <ProtectedRoute requiredPermissions={["access_student_management"]}>
      <h1>Students</h1>
    </ProtectedRoute>
  );
}
