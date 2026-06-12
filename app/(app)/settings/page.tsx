import { Suspense } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import SettingsClient from "./_components/SettingsClient";

export default function Settings() {
  return (
    <ProtectedRoute requiredPermissions={[]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        My Profile
      </h1>
      <Suspense fallback={null}>
        <SettingsClient />
      </Suspense>
    </ProtectedRoute>
  );
}
