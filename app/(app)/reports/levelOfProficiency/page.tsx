import ProtectedRoute from "@/components/ProtectedRoute";

export default function LevelOfProficiency() {
  return (
    <ProtectedRoute requiredPermissions={["reports.view_all"]}>
      <h1>Level of Proficiency</h1>
    </ProtectedRoute>
  );
}
