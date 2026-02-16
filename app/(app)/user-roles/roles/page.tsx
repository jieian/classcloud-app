// app/(app)/user-roles/roles/page.tsx
import ProtectedRoute from "@/components/ProtectedRoute";
import { RolesSection } from "./_components/RolesSection";

export default function RolesManagement() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Roles Management
      </h1>
      <RolesSection />
    </ProtectedRoute>
  );
}
