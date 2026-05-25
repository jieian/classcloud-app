import ProtectedRoute from "@/components/ProtectedRoute";
import SubjectReportDetailsClient from "../../_components/SubjectReportDetailsClient";

interface Props {
  params: Promise<{ gradeLevelId: string; subjectId: string }>;
}

export default async function SubjectReportDetailsPage({ params }: Props) {
  const { gradeLevelId, subjectId } = await params;
  const parsedGradeLevelId = Number(gradeLevelId);
  const parsedSubjectId = Number(subjectId);

  return (
    <ProtectedRoute match="any" requiredPermissions={["reports.view_all"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Subject Report Details</h1>
      <SubjectReportDetailsClient
        gradeLevelId={Number.isFinite(parsedGradeLevelId) ? parsedGradeLevelId : 0}
        subjectId={Number.isFinite(parsedSubjectId) ? parsedSubjectId : 0}
      />
    </ProtectedRoute>
  );
}
