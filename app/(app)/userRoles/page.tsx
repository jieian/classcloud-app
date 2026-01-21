import ProtectedRoute from "@/components/ProtectedRoute";

export default function UserRoles() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1>User Roles</h1>
    </ProtectedRoute>
  );
}
