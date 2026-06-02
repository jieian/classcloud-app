import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScheduledClient from "./_components/ScheduledClient";

export const metadata: Metadata = {
  title: "Scheduled Announcements | ClassCloud",
};

export default function ScheduledAnnouncementsPage() {
  return (
    <ProtectedRoute match="any" requiredPermissions={["announcements.full_access"]}>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-[#597D37]">
        Scheduled Announcements
      </h1>
      <ScheduledClient />
    </ProtectedRoute>
  );
}
