import ProtectedRoute from "@/components/ProtectedRoute";
import GradeReportDetailsClient from "../../_components/GradeReportDetailsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; sectionId: string }>;
}

export default async function GradeReportDetailsByGradePage({ params }: Props) {
  const { gradeLevelId, sectionId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSectionId = Number(sectionId);

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all"]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Grade Report Details</h1>
      <GradeReportDetailsClient
        sectionId={Number.isFinite(parsedSectionId) ? parsedSectionId : 0}
        initialGradeLevelId={
          Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : null
        }
      />
    </ProtectedRoute>
  );
}
