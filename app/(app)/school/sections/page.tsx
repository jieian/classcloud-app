import ProtectedRoute from "@/components/ProtectedRoute";

export default function Sections() {
  return (
    <ProtectedRoute requiredPermissions={["access_section_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Sections</h1>
    </ProtectedRoute>
  );
}
