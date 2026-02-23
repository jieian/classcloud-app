import { redirect } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import AddFacultyWizard from "../_components/AddFacultyWizard";

interface FacultyCreatePageProps {
  searchParams: Promise<{ uid?: string }>;
}

export default async function FacultyCreatePage({
  searchParams,
}: FacultyCreatePageProps) {
  const { uid } = await searchParams;

  if (!uid) {
    redirect("/school/faculty");
  }

  return (
    <ProtectedRoute requiredPermissions={["access_faculty_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Faculty Management
      </h1>
      <AddFacultyWizard facultyUid={uid} />
    </ProtectedRoute>
  );
}
