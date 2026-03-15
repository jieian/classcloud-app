import type { Metadata } from "next";
import TransferRequestsClient from "./_components/TransferRequestsClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export const metadata: Metadata = {
  title: "Transfer Requests | ClassCloud",
};

export default function TransferRequestsPage() {
  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "classes.full_access",
        "students.limited_access",
        "students.full_access",
      ]}
    >
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Transfer Requests Management
      </h1>
      <TransferRequestsClient />
    </ProtectedRoute>
  );
}
