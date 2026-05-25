import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "../../../_components/ReportAnalyticsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; subjectId: string }>;
}

export default async function SubjectReportAnalyticsPage({ params }: Props) {
  const { gradeLevelId, subjectId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSubjectId = Number(subjectId);

  return (
    <ProtectedRoute match="any" requiredPermissions={["reports.view_all"]}>
      <ReportAnalyticsClient
        mode="subject"
        initialGradeLevelId={Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null}
        initialSubjectId={Number.isFinite(parsedSubjectId) ? parsedSubjectId : null}
      />
    </ProtectedRoute>
  );
}
