import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExamPageClient from "./_components/ExamPageClient";
import { getExamInitData } from "./_lib/examServerService";

async function ExamContent() {
  const initialData = await getExamInitData().catch(() => null);
  return <ExamPageClient initialData={initialData} />;
}

const LoadingFallback = (
  <div className="space-y-4">
    {/* Heading row */}
    <div className="flex items-center justify-between mb-1">
      <div className="h-8 w-44 rounded-md bg-gray-200 animate-pulse" />
      <div className="h-9 w-32 rounded-md bg-gray-200 animate-pulse" />
    </div>
    {/* Subtitle */}
    <div className="h-4 w-56 rounded-md bg-gray-200 animate-pulse mb-2" />
    {/* Search + refresh */}
    <div className="flex items-center gap-2">
      <div className="h-9 flex-1 max-w-2xl rounded-md bg-gray-200 animate-pulse" />
      <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />
    </div>
    {/* Filter dropdowns */}
    <div className="flex flex-wrap gap-2">
      <div className="h-9 w-48 rounded-md bg-gray-200 animate-pulse" />
      <div className="h-9 w-48 rounded-md bg-gray-200 animate-pulse" />
      <div className="h-9 w-48 rounded-md bg-gray-200 animate-pulse" />
    </div>
    {/* Accordion item 1 — 4 cards */}
    <div className="rounded-lg overflow-hidden border border-gray-200">
      <div className="px-4 py-3 bg-gray-100 flex items-center gap-2">
        <div className="h-5 w-20 rounded-sm bg-gray-300 animate-pulse" />
        <div className="h-4 w-8 rounded-sm bg-gray-300 animate-pulse" />
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-44 rounded-md bg-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
    {/* Accordion item 2 — 2 cards */}
    <div className="rounded-lg overflow-hidden border border-gray-200">
      <div className="px-4 py-3 bg-gray-100 flex items-center gap-2">
        <div className="h-5 w-16 rounded-sm bg-gray-300 animate-pulse" />
        <div className="h-4 w-8 rounded-sm bg-gray-300 animate-pulse" />
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-44 rounded-md bg-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
  </div>
);

export default async function Exam() {
  await createServerSupabaseClient();

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["exams.full_access", "exams.limited_access"]}
      loadingFallback={LoadingFallback}
    >
      <Suspense fallback={LoadingFallback}>
        <ExamContent />
      </Suspense>
    </ProtectedRoute>
  );
}
