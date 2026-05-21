import ProtectedRoute from "@/components/ProtectedRoute";
import { prefetchWizardInitialData } from "./_lib/wizardServerService";
import CreateSchoolYearWizard from "./_components/CreateSchoolYearWizard";

export default async function CreateSchoolYearPage() {
  const initialData = await prefetchWizardInitialData();

  return (
    <ProtectedRoute requiredPermissions={["school_year.full_access"]}>
      <h1 className="text-3xl font-bold mb-4 sm:mb-6 text-[#597D37]">School Year</h1>
      <CreateSchoolYearWizard initialData={initialData} />
    </ProtectedRoute>
  );
}
