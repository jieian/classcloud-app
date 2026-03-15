import ProtectedRoute from "@/components/ProtectedRoute";
import SettingsClient from "./_components/SettingsClient";

export default function Settings() {
  return (
    <ProtectedRoute requiredPermissions={[]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Account Settings
      </h1>
      <h2 className="text-2xl font-bold mb-4">My Account</h2>
      <SettingsClient />
    </ProtectedRoute>
  );
}
