import ProtectedRoute from "@/components/ProtectedRoute";
import CurriculumSection from "./_components/CurriculumSection";
import { getCurriculumsCached } from "./_lib/curriculumServerService";

export default async function CurriculumPage() {
  const curriculums = await getCurriculumsCached();

  return (
    <ProtectedRoute requiredPermissions={["curriculum.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Curriculum</h1>
      <CurriculumSection initialData={curriculums} />
    </ProtectedRoute>
  );
}
