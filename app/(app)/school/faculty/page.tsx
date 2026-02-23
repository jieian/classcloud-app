import ProtectedRoute from "@/components/ProtectedRoute";
import { FacultySection } from "./_components/FacultySection";

export default function Faculty() {
  return (
    <ProtectedRoute requiredPermissions={["access_faculty_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Faculty</h1>
      <FacultySection />
    </ProtectedRoute>
  );
}
