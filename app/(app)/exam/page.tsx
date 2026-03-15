import ProtectedRoute from "@/components/ProtectedRoute";
import ExamPageClient from "./_components/ExamPageClient";

export default function Exam() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={["exams.full_access", "exams.limited_access"]}
      loadingFallback={
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-8 w-48 rounded-md bg-gray-200 animate-pulse" />
              <div className="h-4 w-64 rounded-md bg-gray-200 animate-pulse" />
            </div>
            <div className="h-10 w-36 rounded-md bg-gray-200 animate-pulse" />
          </div>
          <div className="h-44 rounded-md bg-gray-200 animate-pulse" />
          <div className="h-44 rounded-md bg-gray-200 animate-pulse" />
        </div>
      }
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Examinations</h1>
      <ExamPageClient />
    </ProtectedRoute>
  );
}
