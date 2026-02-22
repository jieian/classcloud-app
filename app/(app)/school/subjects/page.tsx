import ProtectedRoute from "@/components/ProtectedRoute";

export default function Subjects() {
  return (
    <ProtectedRoute requiredPermissions={["access_subject_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Subjects</h1>
    </ProtectedRoute>
  );
}
