import ProtectedRoute from "@/components/ProtectedRoute";

export default function Sections() {
  return (
    <ProtectedRoute requiredPermissions={["access_section_management"]}>
      <h1>Sections</h1>
    </ProtectedRoute>
  );
}
