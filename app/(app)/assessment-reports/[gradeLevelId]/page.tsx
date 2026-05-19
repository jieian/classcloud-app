import ProtectedRoute from "@/components/ProtectedRoute";
import AssessmentReportsBrowser from "../_components/AssessmentReportsBrowser";

interface Props {
  params: Promise<{ gradeLevelId: string }>;
}

export default async function AssessmentReportsByGradePage({ params }: Props) {
  const { gradeLevelId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all"]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Assessment Reports
      </h1>
      <AssessmentReportsBrowser
        initialGradeLevelId={
          Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null
        }
      />
    </ProtectedRoute>
  );
}
