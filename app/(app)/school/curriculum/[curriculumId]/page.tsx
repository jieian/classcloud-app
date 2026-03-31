import { notFound } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import CurriculumDetailClient from "./_components/CurriculumDetailClient";
import { getCurriculumDetailCached, getGradeLevelsCached, getLockedSubjectIds, isCurriculumDeletable } from "../_lib/curriculumServerService";

interface Props {
  params: Promise<{ curriculumId: string }>;
}

export default async function CurriculumDetailPage({ params }: Props) {
  const { curriculumId } = await params;
  const id = parseInt(curriculumId, 10);
  if (isNaN(id)) notFound();

  const [curriculum, canDelete, gradeLevels, lockedSubjectIds] = await Promise.all([
    getCurriculumDetailCached(id),
    isCurriculumDeletable(id),
    getGradeLevelsCached(),
    getLockedSubjectIds(id),
  ]);
  if (!curriculum) notFound();

  return (
    <ProtectedRoute requiredPermissions={["curriculum.full_access"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Curriculum</h1>
      <CurriculumDetailClient initialData={curriculum} canDelete={canDelete} gradeLevels={gradeLevels} lockedSubjectIds={lockedSubjectIds} />
    </ProtectedRoute>
  );
}
