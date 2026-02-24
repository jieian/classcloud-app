import ProtectedRoute from "@/components/ProtectedRoute";
import { SubjectSection } from "./_components/SubjectSection";

export default function Subjects() {
  return (
    <ProtectedRoute requiredPermissions={["access_subject_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Subject Management
      </h1>
      <SubjectSection />
    </ProtectedRoute>
  );
}
