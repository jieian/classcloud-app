import type { Metadata } from "next";
import ProtectedRoute from "@/components/ProtectedRoute";
import CreateAnnouncementClient from "./_components/CreateAnnouncementClient";

export const metadata: Metadata = {
  title: "Create Announcement | ClassCloud",
};

export default function CreateAnnouncementPage() {
  return (
    <ProtectedRoute match="any" requiredPermissions={["announcements.full_access"]}>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-[#597D37]">
        Create Announcement
      </h1>
      <CreateAnnouncementClient />
    </ProtectedRoute>
  );
}
