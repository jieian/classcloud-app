import { createClient } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

type RoleRow = { role_id: number; name: string; is_faculty: boolean };
type UserRoleJoin = { roles: RoleRow | RoleRow[] | null };
type CandidateUserRow = {
  uid: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  user_roles: UserRoleJoin[] | null;
};

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(caller.id);
  if (!permissions.includes("access_classes_management")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const includeAssigned =
    new URL(request.url).searchParams.get("include_assigned") === "true";

  const { data: usersData, error: usersError } = await adminClient
    .from("users")
    .select(
      `uid, first_name, middle_name, last_name,
       user_roles(roles(role_id, name, is_faculty))`,
    )
    .eq("active_status", 1)
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (usersError) {
    return Response.json({ error: usersError.message }, { status: 500 });
  }

  const { data: adviserRows, error: adviserRowsError } = await adminClient
    .from("sections")
    .select("adviser_id")
    .not("adviser_id", "is", null)
    .is("deleted_at", null);

  if (adviserRowsError) {
    return Response.json({ error: adviserRowsError.message }, { status: 500 });
  }

  const adviserSet = new Set(
    ((adviserRows ?? []) as Array<{ adviser_id: string | null }>)
      .map((row) => row.adviser_id)
      .filter((uid): uid is string => Boolean(uid)),
  );

  const rows = (usersData as CandidateUserRow[] | null) ?? [];

  const data = rows
    .filter((u) => includeAssigned || !adviserSet.has(u.uid))
    .map((u) => {
      const roleMap = new Map<number, RoleRow>();
      for (const join of u.user_roles ?? []) {
        const roles = join.roles
          ? Array.isArray(join.roles)
            ? join.roles
            : [join.roles]
          : [];
        for (const role of roles) {
          roleMap.set(role.role_id, role);
        }
      }

      return {
        uid: u.uid,
        first_name: u.first_name,
        middle_name: u.middle_name,
        last_name: u.last_name,
        roles: [...roleMap.values()],
      };
    })
    .filter((u) => u.roles.some((role) => role.is_faculty));

  return Response.json({ data });
}
