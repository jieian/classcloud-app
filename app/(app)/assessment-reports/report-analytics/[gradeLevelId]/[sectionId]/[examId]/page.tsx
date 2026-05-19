import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "../../../_components/ReportAnalyticsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; sectionId: string; examId: string }>;
}

export default async function ReportAnalyticsByExamPage({ params }: Props) {
  const { gradeLevelId, sectionId, examId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSectionId = Number(sectionId);
  const parsedExamId = Number(examId);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all"]}
    >
      <ReportAnalyticsClient
        initialGradeLevelId={
          Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null
        }
        initialSectionId={Number.isFinite(parsedSectionId) ? parsedSectionId : null}
        initialExamId={Number.isFinite(parsedExamId) ? parsedExamId : null}
      />
    </ProtectedRoute>
  );
}
