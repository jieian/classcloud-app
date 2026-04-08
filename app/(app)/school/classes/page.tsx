import { Suspense } from "react";
import { createServerSupabaseClient, getUserPermissions } from "@/lib/supabase/server";
import ProtectedRoute from "@/components/ProtectedRoute";
import ClassesClient from "./_components/ClassesClient";
import ClassesSkeleton from "./_components/ClassesSkeleton";
import { getClassesInitData } from "./_lib/classesServerService";

const REQUIRED_PERMISSIONS = [
  "classes.full_access",
  "students.limited_access",
  "students.full_access",
] as const;

async function ClassesContent({
  userId,
  permissions,
}: {
  userId: string;
  permissions: string[];
}) {
  const initialData = await getClassesInitData(userId, permissions).catch(() => null);
  return <ClassesClient initialData={initialData} />;
}

export default async function Classes() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getUserPermissions(user.id) : [];

  return (
    <ProtectedRoute match="any" requiredPermissions={[...REQUIRED_PERMISSIONS]}>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Classes</h1>
      {user ? (
        <Suspense fallback={<ClassesSkeleton />}>
          <ClassesContent userId={user.id} permissions={permissions} />
        </Suspense>
      ) : (
        <ClassesClient initialData={null} />
      )}
    </ProtectedRoute>
  );
}
