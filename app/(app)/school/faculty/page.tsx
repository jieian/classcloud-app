import ProtectedRoute from "@/components/ProtectedRoute";
import { FacultySection } from "./_components/FacultySection";

export default function Faculty() {
  return (
    <ProtectedRoute requiredPermissions={["faculty.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Faculty Management
      </h1>
      <FacultySection />
    </ProtectedRoute>
  );
}
