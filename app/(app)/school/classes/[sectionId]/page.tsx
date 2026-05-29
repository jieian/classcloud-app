import { redirect } from "next/navigation";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import ClassDetailClient from "./_components/ClassDetailClient";
import { canLimitedAccessSection } from "../_lib/classesServerService";

interface Props {
  params: Promise<{ sectionId: string }>;
}

export default async function ClassDetailPage({ params }: Props) {
  const { sectionId } = await params;
  const id = parseInt(sectionId, 10);

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
        "classes.full_access",
        "students.limited_access",
        "students.full_access",
      ]}
    >
      <ClassDetailClient sectionId={id} />
    </ProtectedRoute>
  );
}
