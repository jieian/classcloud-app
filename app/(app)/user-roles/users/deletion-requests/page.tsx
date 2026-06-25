import ProtectedRoute from "@/components/ProtectedRoute";
import DeletionRequestsClient from "./_components/DeletionRequestsClient";

export default function DeletionRequestsPage() {
  return (
    <ProtectedRoute requiredPermissions={["users.full_access"]}>
      <h1 className="mb-6 text-2xl md:text-3xl font-bold text-[#597D37]">
        Account Deletion Requests
      </h1>
      <DeletionRequestsClient />
    </ProtectedRoute>
  );
}
