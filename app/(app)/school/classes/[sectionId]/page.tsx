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
        "classes.full_access",
        "students.limited_access",
        "students.full_access",
      ]}
    >
      <ClassDetailClient sectionId={id} />
    </ProtectedRoute>
  );
}
