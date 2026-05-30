import ProtectedRoute from "@/components/ProtectedRoute";
import SchoolYearSection from "./_components/SchoolYearSection";
import { getSchoolYearsFullCached } from "./_lib/yearServerService";

export default async function SchoolYear() {
  const initialSchoolYears = await getSchoolYearsFullCached();

  return (
    <ProtectedRoute requiredPermissions={["school_year.full_access"]}>
      <SchoolYearSection initialSchoolYears={initialSchoolYears} />
    </ProtectedRoute>
  );
}
