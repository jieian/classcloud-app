import ProtectedRoute from "@/components/ProtectedRoute";
import CreateUserWizard from "../_components/CreateUserWizard";

export default function CreateUser() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <CreateUserWizard />
    </ProtectedRoute>
  );
}
