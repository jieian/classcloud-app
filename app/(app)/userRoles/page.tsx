// app/(app)/userRoles/page.tsx
import ProtectedRoute from "@/components/ProtectedRoute";
import UsersTableWrapper from "@/components/userRoles/UsersTableWrapper";

export default function UserRoles() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 style={{ marginBottom: "var(--mantine-spacing-lg)" }}>User Roles</h1>
      <UsersTableWrapper />
    </ProtectedRoute>
  );
}
