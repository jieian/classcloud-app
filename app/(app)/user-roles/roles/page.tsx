// app/(app)/user-roles/roles/page.tsx
import ProtectedRoute from "@/components/ProtectedRoute";
import { RolesSection } from "./_components/RolesSection";
import { fetchRolesWithPermissionsServer } from "./_lib/rolesServerService";

export default async function RolesManagement() {
  const initialRoles = await fetchRolesWithPermissionsServer();

  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Roles Management
      </h1>
      <RolesSection initialRoles={initialRoles} />
    </ProtectedRoute>
  );
}
