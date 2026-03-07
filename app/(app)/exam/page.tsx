import ProtectedRoute from "@/components/ProtectedRoute";
import ExamPageClient from "./_components/ExamPageClient";

export default function Exam() {
  return (
    <ProtectedRoute 
    match="any"
    requiredPermissions={["full_access_examinations", "partial_access_examinations"]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Examinations</h1>
      <ExamPageClient />
    </ProtectedRoute>
  );
}
