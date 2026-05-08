import { cacheTag, cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { WizardCurriculumListItem, WizardFacultyOption, WizardInitialData } from "./types";

export const SCHOOL_YEARS_CACHE_TAG = "school-years";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function fetchLatestSchoolYear() {
  "use cache";
  cacheTag(SCHOOL_YEARS_CACHE_TAG);
  cacheLife("minutes");
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("school_years")
    .select("sy_id, start_year, curriculum_id")
    .is("deleted_at", null)
    .order("start_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? {
        sy_id: (data as any).sy_id as number,
        start_year: (data as any).start_year as number,
        curriculum_id: ((data as any).curriculum_id ?? null) as number | null,
      }
    : null;
}

async function fetchCurriculaList(): Promise<WizardCurriculumListItem[]> {
  "use cache";
  cacheTag("curriculums");
  cacheLife("minutes");
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("curriculums")
    .select("curriculum_id, name, description, created_at")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: any) => ({
    curriculum_id: c.curriculum_id as number,
    name: c.name as string,
    description: (c.description ?? null) as string | null,
    created_at: c.created_at as string,
  }));
}

async function fetchFacultyList(): Promise<WizardFacultyOption[]> {
  "use cache";
  cacheTag("faculty");
  cacheLife("minutes");
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("uid, first_name, last_name, user_roles!inner(roles!inner(is_faculty))")
    .eq("active_status", 1)
    .is("deleted_at", null)
    .eq("user_roles.roles.is_faculty", true);
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const result: WizardFacultyOption[] = [];
  for (const row of data ?? []) {
    const r = row as any;
    if (seen.has(r.uid)) continue;
    seen.add(r.uid);
    result.push({ uid: r.uid, first_name: r.first_name, last_name: r.last_name });
  }
  return result.sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name) ||
      a.last_name.localeCompare(b.last_name)
  );
}

export async function prefetchWizardInitialData(): Promise<WizardInitialData> {
  const [prevSy, curricula, faculty] = await Promise.all([
    fetchLatestSchoolYear(),
    fetchCurriculaList(),
    fetchFacultyList(),
  ]);
  return { prevSy, curricula, faculty };
}
