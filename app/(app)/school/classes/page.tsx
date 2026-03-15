import ProtectedRoute from "@/components/ProtectedRoute";
import ClassesClient from "./_components/ClassesClient";

export default function Classes() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "classes.full_access",
        "students.limited_access",
        "students.full_access",
      ]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Classes</h1>
      <ClassesClient />
    </ProtectedRoute>
  );
}
