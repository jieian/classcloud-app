import ProtectedRoute from "@/components/ProtectedRoute";
import SchoolYearSection from "./_components/SchoolYearSection";

export default function SchoolYear() {
  return (
    <ProtectedRoute requiredPermissions={["school_year.full_access"]}>
      <SchoolYearSection />
    </ProtectedRoute>
  );
}
