// app/(app)/userRoles/page.tsx
import ProtectedRoute from "@/components/ProtectedRoute";
import { PendingSection } from "./_components/PendingSection";
import { ActiveUsersSection } from "./_components/ActiveUsersSection";
import { Divider } from "@mantine/core";

export default function UserRoles() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Users and Roles Management
      </h1>
      <Divider my="lg" />
      <PendingSection />
      <Divider my="lg" />
      <ActiveUsersSection />
    </ProtectedRoute>
  );
}
