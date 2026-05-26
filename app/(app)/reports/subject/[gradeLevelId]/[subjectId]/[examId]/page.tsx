import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "../../../../_components/ReportAnalyticsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; subjectId: string; examId: string }>;
}

export default async function SubjectReportAnalyticsByExamPage({ params }: Props) {
  const { gradeLevelId, subjectId, examId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSubjectId = Number(subjectId);
  const parsedExamId = Number(examId);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all", "reports.view_assigned", "reports.monitor_grade_level", "reports.monitor_subjects", "reports.approve"]}
    >
      <ReportAnalyticsClient
        mode="subject"
        initialGradeLevelId={Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null}
        initialSubjectId={Number.isFinite(parsedSubjectId) ? parsedSubjectId : null}
        initialExamId={Number.isFinite(parsedExamId) ? parsedExamId : null}
      />
    </ProtectedRoute>
  );
}
