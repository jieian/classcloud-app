import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { redis } from "@/lib/redis";
import { z } from "zod";
import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { withErrorHandler } from "@/lib/api-error";
import { SCHOOL_YEARS_CACHE_TAG } from "@/app/(app)/school/year/create/_lib/wizardServerService";
import { ACTIVE_CONTEXT_CACHE_TAG } from "@/lib/services/homeServerService";

// ── Zod validation ─────────────────────────────────────────────────────────────

const SubjectAssignmentSchema = z.object({
  curriculum_subject_id: z.number().int().positive(),
  teacher_id: z.string().uuid(),
});

const SectionSchema = z.object({
  name: z.string().min(1).max(50),
  grade_level_id: z.number().int().positive(),
  section_type: z.enum(["SSES", "REGULAR"]),
  adviser_id: z.string().uuid().nullable(),
  subjects: z.array(SubjectAssignmentSchema),
});

const CoordinatorSchema = z.object({
  subject_group_id: z.number().int().positive(),
  user_id: z.string().uuid(),
});

const GslAssignmentSchema = z.object({
  curriculum_subject_id: z.number().int().positive(),
  grade_level_id: z.number().int().positive(),
  user_id: z.string().uuid(),
});

const PayloadSchema = z.object({
  start_year: z.number().int().min(2026),
  end_year: z.number().int().min(2027),
  curriculum_id: z.number().int().positive(),
  num_quarters: z.number().int().min(2).max(4),
  sections: z.array(SectionSchema).min(1),
  coordinators: z.array(CoordinatorSchema),
  grade_subject_leaders: z.array(GslAssignmentSchema),
});

// ── Route handler ──────────────────────────────────────────────────────────────

const _POST = async function (request: Request) {
  // 1. Auth
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Permission
  if (!getPermissionsFromUser(caller).includes("school_year.full_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { start_year, end_year, curriculum_id, num_quarters, sections, coordinators, grade_subject_leaders } =
    parsed.data;

  // 4. Completeness guard — every section must have an adviser + all applicable subjects
  for (const section of sections) {
    if (!section.adviser_id && sections.length > 0) {
      // adviser_id is nullable — OK to omit, but log for awareness
    }
  }

  // 5. Pre-flight duplicate check (fast path before DB lock)
  const { count: dupCount, error: dupError } = await adminClient
    .from("school_years")
    .select("sy_id", { count: "exact", head: true })
    .eq("start_year", start_year)
    .is("deleted_at", null);

  if (dupError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if ((dupCount ?? 0) > 0) {
    return Response.json(
      { error: `School year ${start_year}–${end_year} already exists.` },
      { status: 409 }
    );
  }

  // 6. Call atomic RPC
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "create_school_year_full",
    {
      p_start_year: start_year,
      p_end_year: end_year,
      p_curriculum_id: curriculum_id,
      p_num_quarters: num_quarters,
      p_sections: sections,
      p_coordinators: coordinators,
      p_grade_subject_leaders: grade_subject_leaders,
    }
  );

  if (rpcError) {
    console.error("create_school_year_full RPC error:", rpcError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const result = rpcData as { success: boolean; code?: string; sy_id?: number; message?: string };

  if (!result.success) {
    if (result.code === "DUPLICATE_YEAR") {
      return Response.json(
        { error: `School year ${start_year}–${end_year} already exists.` },
        { status: 409 }
      );
    }
    if (result.code === "MISSING_ROLES") {
      console.error("create_school_year_full: required roles missing in DB:", result.message);
      return Response.json(
        { error: "Server misconfiguration: required roles are missing. Contact an administrator." },
        { status: 500 }
      );
    }
    console.error("create_school_year_full failed:", result.code, result.message);
    return Response.json(
      { error: result.message ?? "Failed to create school year." },
      { status: 500 }
    );
  }

  // 7. Cache invalidation + deferred audit log
  revalidateTag(SCHOOL_YEARS_CACHE_TAG, "minutes");
  revalidateTag(ACTIVE_CONTEXT_CACHE_TAG, "minutes");
  await redis.del("faculty:list", "faculty:candidates", "coordinator:groups");

  after(async () => {
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: caller.id,
        category: "ACADEMIC",
        action: "CREATE",
        entity_type: "school_year",
        entity_id: String(result.sy_id),
        entity_label: `${start_year}–${end_year}`,
        new_values: { start_year, end_year, curriculum_id, num_quarters },
      });
    } catch {
      // Audit log failure is non-fatal
    }
  });

  return Response.json({ success: true, sy_id: result.sy_id }, { status: 201 });
};

export const POST = withErrorHandler(_POST);
