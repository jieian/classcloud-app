import { Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import GradeReportsBrowser from "./_components/GradeReportsBrowser";
import { getReportInitData } from "../_lib/reportServerService";

async function GradeReportsContent() {
  const initData = await getReportInitData();
  return <GradeReportsBrowser initialData={initData} />;
}

const LoadingFallback = (
  <div className="space-y-4">
    <div className="h-8 w-56 rounded-md bg-gray-200 animate-pulse" />
    <div className="h-4 w-64 rounded-md bg-gray-200 animate-pulse mb-2" />
    <div className="flex items-center gap-2">
      <div className="h-9 flex-1 max-w-2xl rounded-md bg-gray-200 animate-pulse" />
      <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />
    </div>
    <div className="h-9 w-52 rounded-md bg-gray-200 animate-pulse" />
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

export default async function GradeReportsPage() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["reports.view_all", "reports.view_assigned", "reports.monitor_grade_level", "reports.monitor_subjects", "reports.approve"]}
      loadingFallback={LoadingFallback}
    >
      <Suspense fallback={LoadingFallback}>
        <GradeReportsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
