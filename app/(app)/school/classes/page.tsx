import { createServerSupabaseClient, getUserPermissions } from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import ClassesClient from "./_components/ClassesClient";
import { getClassesInitData } from "./_lib/classesServerService";

const REQUIRED_PERMISSIONS = [
  "classes.full_access",
  "students.limited_access",
  "students.full_access",
] as const;

export default async function Classes() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialData = null;
  if (user) {
    const permissions = await getUserPermissions(user.id);
    const hasAccess = REQUIRED_PERMISSIONS.some((p) => permissions.includes(p));
    if (hasAccess) {
      initialData = await getClassesInitData(user.id, permissions).catch(() => null);
    }
  }

  return (
    <ProtectedRoute match="any" requiredPermissions={[...REQUIRED_PERMISSIONS]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Classes</h1>
      <ClassesClient initialData={initialData} />
    </ProtectedRoute>
  );
}
