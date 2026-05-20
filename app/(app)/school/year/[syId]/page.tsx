import { Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BackButton from "@/components/BackButton";
import SchoolYearDetailContent from "./_components/SchoolYearDetailContent";
import SchoolYearDetailSkeleton from "./_components/SchoolYearDetailSkeleton";

interface Props {
  params: Promise<{ syId: string }>;
}

export default async function SchoolYearDetailPage({ params }: Props) {
  const { syId } = await params;

  return (
    <ProtectedRoute requiredPermissions={["school_year.full_access"]}>
      <h1 className="mb-6 text-3xl font-bold text-[#597D37]">School Year</h1>
      <BackButton href="/school/year" mb="md" size="sm">
        Back to School Year Menu
      </BackButton>
      <Suspense fallback={<SchoolYearDetailSkeleton />}>
        <SchoolYearDetailContent syId={syId} />
      </Suspense>
    </ProtectedRoute>
  );
}
