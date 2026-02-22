import ProtectedRoute from "@/components/ProtectedRoute";

export default function Students() {
  return (
    <ProtectedRoute requiredPermissions={["access_student_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Students</h1>
    </ProtectedRoute>
  );
}
