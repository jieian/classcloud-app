import ProtectedRoute from "@/components/ProtectedRoute";
import ExamPageClient from "./_components/ExamPageClient";

export default function Exam() {
  return (
    <ProtectedRoute requiredPermissions={["access_examinations"]}>
      <ExamPageClient />
    </ProtectedRoute>
  );
}
