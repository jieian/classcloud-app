import ProtectedRoute from "@/components/ProtectedRoute";
import ClassesClient from "./_components/ClassesClient";

export default function Classes() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "access_classes_management",
        "partial_access_student_management",
        "full_access_student_management",
      ]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Classes Management
      </h1>
      <ClassesClient />
    </ProtectedRoute>
  );
}
