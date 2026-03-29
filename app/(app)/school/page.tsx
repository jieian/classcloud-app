import ProtectedRoute from "@/components/ProtectedRoute";

export default function School() {
  return (
    <ProtectedRoute
      requiredPermissions={[
        "access_year_management",
        "access_faculty_management",
        "access_subject_management",
        "access_student_management",
        "access_section_management",
      ]}
    >
      <h1>School</h1>
    </ProtectedRoute>
  );
}
