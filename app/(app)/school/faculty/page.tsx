import ProtectedRoute from "@/components/ProtectedRoute";
import { getActiveContext } from "@/lib/active-context";
import { FacultySection } from "./_components/FacultySection";

interface Props {
  searchParams: Promise<{ highlight?: string }>;
}

export default async function Faculty({ searchParams }: Props) {
  const { sy_id, quarter_id } = await getActiveContext();
  const isActive = sy_id !== null && quarter_id !== null;
  const { highlight } = await searchParams;

  return (
    <ProtectedRoute requiredPermissions={["faculty.full_access"]}>
      <h1 className="mb-6 text-2xl md:text-3xl font-bold text-[#597D37]">
        Faculty Management
      </h1>
      <FacultySection
        isActive={isActive}
        highlightCoordinators={highlight === "coordinators"}
      />
    </ProtectedRoute>
  );
}
