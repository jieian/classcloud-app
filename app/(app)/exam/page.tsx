import ProtectedRoute from "@/components/ProtectedRoute";
import ExamPageClient from "./_components/ExamPageClient";

export default function Exam() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["full_access_examinations", "partial_access_examinations"]}
      loadingFallback={
        <div className="space-y-4">
          <div className="h-10 w-56 rounded-md bg-gray-200 animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-gray-200 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-28 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-28 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-28 rounded-md bg-gray-200 animate-pulse" />
          </div>
        </div>
      }
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Examinations</h1>
      <ExamPageClient />
    </ProtectedRoute>
  );
}
