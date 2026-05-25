import ProtectedRoute from "@/components/ProtectedRoute";
import GradeReportsBrowser from "../_components/GradeReportsBrowser";

interface Props {
  params: Promise<{ gradeLevelId: string }>;
}

export default async function GradeReportsByGradePage({ params }: Props) {
  const { gradeLevelId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);

  return (
    <ProtectedRoute match="any" requiredPermissions={["reports.view_all"]}>
      <GradeReportsBrowser
        initialGradeLevelId={
          Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null
        }
      />
    </ProtectedRoute>
  );
}
