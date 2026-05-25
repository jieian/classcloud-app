import ProtectedRoute from "@/components/ProtectedRoute";
import CurriculumSection from "./_components/CurriculumSection";

export default function CurriculumPage() {
  return (
    <ProtectedRoute requiredPermissions={["curriculum.full_access"]}>
      <CurriculumSection />
    </ProtectedRoute>
  );
}
