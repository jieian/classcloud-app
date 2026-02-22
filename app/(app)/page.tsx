import ProtectedRoute from "@/components/ProtectedRoute";

export default function Home() {
  return (
    <ProtectedRoute requiredPermissions={[]}>
      <div>Home</div>
    </ProtectedRoute>
  );
}
