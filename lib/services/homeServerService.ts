import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { HomeActiveContext } from "./homeService";
import { getActiveContext } from "@/lib/active-context";
import { getUserAssignmentsContext } from "@/lib/services/userAssignmentsCache";

export const ACTIVE_CONTEXT_CACHE_TAG = "active-context";

type SectionRow  = { section_id: number };
type SchoolYearRow = { sy_id: number; year_range: string | null };
type QuarterRow  = { name: string | null };

export async function getAdvisorySectionId(userId: string, syId: number): Promise<number | null> {
  const activeCtx = await getActiveContext();

  if (activeCtx.sy_id === syId) {
    // Active SY: read from Redis cache (zero DB query)
    const userCtx = await getUserAssignmentsContext(userId);
    return userCtx.advisorySections[0]?.section_id ?? null;
  }

  // Historical SY: targeted DB query
  const { data: section } = await admin
    .from("sections")
    .select("section_id")
    .eq("adviser_id", userId)
    .eq("sy_id", syId)
    .is("deleted_at", null)
    .maybeSingle();

  return (section as SectionRow | null)?.section_id ?? null;
}

// Dual-cached intentionally: Redis (lib/active-context.ts) serves API routes;
// this Next.js Data Cache entry serves server components. Both invalidated on SY events.
export async function getHomeActiveContextCached(): Promise<Omit<HomeActiveContext, "advisorySectionId">> {
  "use cache";
  cacheTag(ACTIVE_CONTEXT_CACHE_TAG);
  cacheLife("days");

  const { data: schoolYear } = await admin
    .from("school_years")
    .select("sy_id, year_range")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!schoolYear) return { termName: null, yearRange: null, syId: null };

  const sy = schoolYear as SchoolYearRow;

  const { data: quarter } = await admin
    .from("quarters")
    .select("name")
    .eq("sy_id", sy.sy_id)
    .eq("is_active", true)
    .maybeSingle();

  const q = quarter as QuarterRow | null;

  return {
    termName: q?.name ?? null,
    yearRange: sy.year_range ?? null,
    syId: sy.sy_id,
  };
}
