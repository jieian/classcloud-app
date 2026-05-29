import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import StudentRosterClient from "./_components/StudentRosterClient";
import { canLimitedAccessSection } from "../../_lib/classesServerService";

export default async function StudentRosterPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const id = Number(sectionId);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const permissions = getPermissionsFromUser(user);
    const hasStudentFullAccess = permissions.includes("students.full_access");

    if (!hasStudentFullAccess && id) {
      const allowed = await canLimitedAccessSection(user.id, id);
      if (!allowed) redirect("/unauthorized");
    }
  }

  return (
    <ProtectedRoute
      match="any"
      requiredPermissions={[
        "students.full_access",
        "students.limited_access",
        "classes.full_access",
      ]}
    >
      <StudentRosterClient sectionId={id} />
    </ProtectedRoute>
  );
}
