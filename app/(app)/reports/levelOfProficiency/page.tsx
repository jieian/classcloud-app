import ProtectedRoute from "@/components/ProtectedRoute";

export default function LevelOfProficiency() {
  return (
    <ProtectedRoute requiredPermissions={["access_reports"]}>
      <h1>Level of Proficiency</h1>
    </ProtectedRoute>
  );
}
