import ProtectedRoute from "@/components/ProtectedRoute";
import { ManageSubjectSection } from "./_components/ManageSubjectSection";

interface ManageSubjectsPageProps {
  params: Promise<{ gradeLevelId: string }>;
}

export default async function ManageSubjectsPage({
  params,
}: ManageSubjectsPageProps) {
  const { gradeLevelId } = await params;
  const id = parseInt(gradeLevelId, 10);

  return (
    <ProtectedRoute requiredPermissions={["access_subject_management"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Subject Management
      </h1>
      <ManageSubjectSection gradeLevelId={id} />
    </ProtectedRoute>
  );
}
