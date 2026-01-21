import ProtectedRoute from "@/components/ProtectedRoute";

export default function SchoolYear() {
  return (
    <ProtectedRoute requiredPermissions={["access_year_management"]}>
      <h1>School Year</h1>
    </ProtectedRoute>
  );
}
