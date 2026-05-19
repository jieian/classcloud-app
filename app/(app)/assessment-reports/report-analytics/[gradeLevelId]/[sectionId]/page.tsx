import ProtectedRoute from "@/components/ProtectedRoute";
import ReportAnalyticsClient from "../../_components/ReportAnalyticsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; sectionId: string }>;
}

export default async function ReportAnalyticsBySectionPage({ params }: Props) {
  const { gradeLevelId, sectionId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSectionId = Number(sectionId);

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
      />
    </ProtectedRoute>
  );
}
