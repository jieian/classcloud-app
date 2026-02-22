import ProtectedRoute from "@/components/ProtectedRoute";

export default function Settings() {
  return (
    <ProtectedRoute requiredPermissions={[]}>
      <div>Settings</div>
    </ProtectedRoute>
  );
}
