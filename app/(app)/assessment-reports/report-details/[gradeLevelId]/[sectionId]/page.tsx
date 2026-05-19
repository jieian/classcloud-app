import ProtectedRoute from "@/components/ProtectedRoute";
import ReportDetailsClient from "../../_components/ReportDetailsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; sectionId: string }>;
}

export default async function ReportDetailsByGradePage({ params }: Props) {
  const { gradeLevelId, sectionId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSectionId = Number(sectionId);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "reports.view_all",
        "reports.view_assigned",
        "reports.monitor_grade_level",
        "reports.monitor_subjects",
        "reports.approve",
      ]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Report Details</h1>
      <ReportDetailsClient
        sectionId={Number.isFinite(parsedSectionId) ? parsedSectionId : 0}
        initialGradeLevelId={
          Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null
        }
      />
    </ProtectedRoute>
  );
}
