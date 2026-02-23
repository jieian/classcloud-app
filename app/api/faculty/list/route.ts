import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoleRow = { role_id: number; name: string; is_faculty: boolean };
type UserRoleJoin = { roles: RoleRow | RoleRow[] | null };
type GradeLevelRow = { grade_level_id: number; display_name: string };
type SectionRow = {
  section_id: string;
  name: string;
  adviser_id: string;
  grade_levels: GradeLevelRow | GradeLevelRow[] | null;
};
type FacultyUserRow = {
  uid: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  user_roles: UserRoleJoin[] | null;
};

export async function GET() {
  // 1. Auth check
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 2. Fetch users who have at least one faculty role
  const { data: usersData, error: usersError } = await adminClient
    .from("users")
    .select(
      `uid, first_name, middle_name, last_name,
       user_roles!inner(roles!inner(role_id, name, is_faculty))`,
    )
    .eq("active_status", 1)
    .eq("user_roles.roles.is_faculty", true)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (usersError) {
    return Response.json({ error: usersError.message }, { status: 500 });
  }

  const facultyUsers = (usersData as FacultyUserRow[] | null) ?? [];
  const facultyUids = facultyUsers.map((u) => u.uid);

  // 3. Fetch advisory sections for these faculty members
  let sectionsData: SectionRow[] = [];
  if (facultyUids.length > 0) {
    const { data: sections, error: sectionsError } = await adminClient
      .from("sections")
      .select(
        `section_id, name, adviser_id,
         grade_levels(grade_level_id, display_name)`,
      )
      .in("adviser_id", facultyUids);

    if (sectionsError) {
      return Response.json({ error: sectionsError.message }, { status: 500 });
    }
    sectionsData = (sections as SectionRow[] | null) ?? [];
  }

  // 4. Fetch emails from auth.users
  const { data: authData, error: authError } =
    await adminClient.auth.admin.listUsers({ perPage: 1000 });

  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 });
  }

  const emailByUid = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  // 5. Map sections by adviser_id (one section per adviser)
  const sectionByUid = new Map(sectionsData.map((s) => [s.adviser_id, s]));

  // 6. Combine
  const data = facultyUsers.map((u) => {
    const section = sectionByUid.get(u.uid) ?? null;
    const gradeLevel = section
      ? Array.isArray(section.grade_levels)
        ? section.grade_levels[0]
        : section.grade_levels
      : null;

    return {
      uid: u.uid,
      first_name: u.first_name,
      middle_name: u.middle_name,
      last_name: u.last_name,
      email: emailByUid.get(u.uid) ?? "",
      advisory_section: section
        ? {
            section_id: section.section_id,
            section_name: section.name,
            grade_level_display: gradeLevel?.display_name ?? "",
          }
        : null,
    };
  });

  return Response.json({ data });
}
