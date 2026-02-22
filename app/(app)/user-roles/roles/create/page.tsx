import ProtectedRoute from "@/components/ProtectedRoute";
import CreateRoleWizard from "../_components/CreateRoleWizard";

export default function CreateRole() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Roles Management
      </h1>
      <CreateRoleWizard />
    </ProtectedRoute>
  );
}
