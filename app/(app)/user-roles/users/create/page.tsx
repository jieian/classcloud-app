import ProtectedRoute from "@/components/ProtectedRoute";
import CreateUserWizard from "../_components/CreateUserWizard";

export default function CreateUser() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        User Management
      </h1>
      <CreateUserWizard />
    </ProtectedRoute>
  );
}
