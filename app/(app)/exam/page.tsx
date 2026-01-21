import ProtectedRoute from "@/components/ProtectedRoute";

export default function Exam() {
  return (
    <ProtectedRoute requiredPermissions={["access_examinations"]}>
      <h1>Examinations</h1>
    </ProtectedRoute>
  );
}
