import ProtectedRoute from "@/components/ProtectedRoute";
import SchoolYearSection from "./_components/SchoolYearSection";

export default function SchoolYear() {
  return (
    <ProtectedRoute requiredPermissions={["school_year.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">School Year</h1>
      <SchoolYearSection />
    </ProtectedRoute>
  );
}
