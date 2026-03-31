import ProtectedRoute from "@/components/ProtectedRoute";
import CreateCurriculumWizard from "./_components/CreateCurriculumWizard";

export default function CreateCurriculumPage() {
  return (
    <ProtectedRoute requiredPermissions={["curriculum.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Curriculum</h1>
      <CreateCurriculumWizard />
    </ProtectedRoute>
  );
}
