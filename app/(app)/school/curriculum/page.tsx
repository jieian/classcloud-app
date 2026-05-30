import ProtectedRoute from "@/components/ProtectedRoute";
import CurriculumSection from "./_components/CurriculumSection";
import { getCurriculumsCached } from "./_lib/curriculumServerService";

export default async function CurriculumPage() {
  const initialCurriculums = await getCurriculumsCached();

  return (
    <ProtectedRoute requiredPermissions={["curriculum.full_access"]}>
      <CurriculumSection initialCurriculums={initialCurriculums} />
    </ProtectedRoute>
  );
}
