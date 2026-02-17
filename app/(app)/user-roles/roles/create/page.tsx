import ProtectedRoute from "@/components/ProtectedRoute";
import CreateRoleWizard from "../_components/CreateRoleWizard";

export default function CreateRole() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <CreateRoleWizard />
    </ProtectedRoute>
  );
}
