import ProtectedRoute from "@/components/ProtectedRoute";
import { getActiveContext } from "@/lib/active-context";
import NoActivePeriodBanner from "@/components/NoActivePeriodBanner";
import MasterlistClient from "./_components/MasterlistClient";

export default async function MasterlistPage() {
  const { sy_id, quarter_id } = await getActiveContext();
  const isActive = sy_id !== null && quarter_id !== null;

  return (
    <ProtectedRoute requiredPermissions={["faculty.full_access"]}>
      <h1 className="mb-6 text-3xl font-bold text-[#597D37]">Faculty Management</h1>
      {isActive ? (
        <MasterlistClient />
      ) : (
        <>
          <div className="mb-4">
            <h2 className="mb-1 text-2xl font-bold">Teaching Load Master List</h2>
            <p className="text-sm text-[#808898]">
              The master record of all subject assignments and advisory designations for the current
              academic period.
            </p>
          </div>
          <NoActivePeriodBanner />
        </>
      )}
    </ProtectedRoute>
  );
}
