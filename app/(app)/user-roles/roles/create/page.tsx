import ProtectedRoute from "@/components/ProtectedRoute";

export default function CreateRole() {
  return (
    <ProtectedRoute requiredPermissions={["access_user_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Create Role</h1>
    </ProtectedRoute>
  );
}
