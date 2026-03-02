import ProtectedRoute from "@/components/ProtectedRoute";
import ClassDetailClient from "./_components/ClassDetailClient";

interface Props {
  params: Promise<{ sectionId: string }>;
}

export default async function ClassDetailPage({ params }: Props) {
  const { sectionId } = await params;
  const id = parseInt(sectionId, 10);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "access_classes_management",
        "partial_access_student_management",
        "full_access_student_management",
      ]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Classes Management
      </h1>
      <ClassDetailClient sectionId={id} />
    </ProtectedRoute>
  );
}
