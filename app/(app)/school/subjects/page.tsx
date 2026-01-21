import ProtectedRoute from "@/components/ProtectedRoute";

export default function Subjects() {
  return (
    <ProtectedRoute requiredPermissions={["access_subject_management"]}>
      <h1>Subjects</h1>
    </ProtectedRoute>
  );
}
