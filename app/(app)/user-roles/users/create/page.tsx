import ProtectedRoute from "@/components/ProtectedRoute";
import CreateUserWizard from "../_components/CreateUserWizard";

export default function CreateUser() {
  return (
    <ProtectedRoute requiredPermissions={["users.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        User Management
      </h1>
      <CreateUserWizard />
    </ProtectedRoute>
  );
}
