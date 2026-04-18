import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import type {
  SectionDetail,
  SectionSubjectRow,
} from "@/lib/services/classService";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { parseBody, RenameSectionSchema } from "@/lib/api-schemas";
const _GET = async function(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });


  // Wave 1: section info + active school year in parallel
  const [{ data: sRaw, error: secError }, { data: syData }] =
    await Promise.all([
      admin
        .from("sections")
        .select(
          "section_id, name, section_type, adviser_id, grade_level_id, grade_levels(display_name), users(first_name, last_name)",
        )
        .eq("section_id", sectionId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("school_years")
        .select("sy_id, curriculum_id")
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

  if (secError) return Response.json({ error: "Internal server error." }, { status: 500 });
  if (!sRaw) return Response.json({ error: "Section not found." }, { status: 404 });

  const s = sRaw as any;
  const activeSyId: number | null = (syData as any)?.sy_id ?? null;
  const gradeLevelId: number = s.grade_level_id;
  const glRaw = s.grade_levels;
  const glDisplay: string = Array.isArray(glRaw)
    ? (glRaw[0]?.display_name ?? "")
    : (glRaw?.display_name ?? "");
  const adviserUser = Array.isArray(s.users) ? s.users[0] : s.users;
  const adviserName = adviserUser
    ? `${adviserUser.first_name ?? ""} ${adviserUser.last_name ?? ""}`.trim() || null
    : null;

  const curriculumId: number | null = (syData as any)?.curriculum_id ?? null;

  // Wave 2: enrollments + curriculum_subjects + teacher assignments — all parallel
  const [{ data: enrollData }, { data: csData }, { data: assignData }] =
    await Promise.all([
      activeSyId
        ? admin
            .from("enrollments")
            .select("enrollment_id")
            .eq("section_id", sectionId)
            .eq("sy_id", activeSyId)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      curriculumId
        ? admin
            .from("curriculum_subjects")
            .select("curriculum_subject_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)")
            .eq("curriculum_id", curriculumId)
            .eq("grade_level_id", gradeLevelId)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      admin
        .from("teacher_class_assignments")
        .select("curriculum_subject_id, teacher_id, users!teacher_id(first_name, last_name)")
        .eq("section_id", sectionId)
        .is("deleted_at", null),
    ]);

  // Map: curriculum_subject_id → { teacher_name, teacher_id }
  const teacherNameMap = new Map<number, string>();
  const teacherIdMap = new Map<number, string>();
  for (const a of (assignData ?? []) as any[]) {
    const u = Array.isArray(a.users) ? a.users[0] : a.users;
    const name = u
      ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
      : "";
    const csId = a.curriculum_subject_id as number;
    if (name) teacherNameMap.set(csId, name);
    if (a.teacher_id) teacherIdMap.set(csId, a.teacher_id as string);
  }

  const sectionType = s.section_type as "SSES" | "REGULAR";

  const subjects: SectionSubjectRow[] = ((csData ?? []) as any[]).flatMap(
    (cs: any) => {
      const sub = cs.subjects;
      if (!sub || sub.deleted_at !== null) return [];
      // BOTH subjects apply to all sections; SSES subjects only for SSES sections
      if (sub.subject_type !== "BOTH" && sectionType !== "SSES") return [];
      const csId = cs.curriculum_subject_id as number;
      return [{
        curriculum_subject_id: csId,
        subject_id: sub.subject_id as number,
        code: sub.code as string,
        name: sub.name as string,
        assigned_teacher: teacherNameMap.get(csId) ?? null,
        assigned_teacher_id: teacherIdMap.get(csId) ?? null,
      }];
    },
  );

  const section: SectionDetail = {
    section_id: s.section_id,
    name: s.name,
    section_type: s.section_type as "SSES" | "REGULAR",
    adviser_id: s.adviser_id,
    adviser_name: adviserName,
    grade_level_id: gradeLevelId,
    grade_level_display: glDisplay,
    student_count: (enrollData ?? []).length,
  };

  return Response.json({ section, subjects });
}

const _PATCH = async function(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const parsed = parseBody(RenameSectionSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { name } = parsed.data;


  const { error } = await admin.rpc("rename_section", {
    p_section_id: sectionId,
    p_name: name,
  });

  if (error)
    return Response.json(
      { error: "Failed to rename section." },
      { status: 500 },
    );

  return Response.json({ success: true });
}

const _DELETE = async function(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("classes.full_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });


  const { error } = await admin
    .from("sections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("section_id", sectionId)
    .is("deleted_at", null);

  if (error)
    return Response.json(
      { error: "Failed to archive section." },
      { status: 500 },
    );

  return Response.json({ success: true });
}

export const GET = withErrorHandler(_GET)
export const PATCH = withErrorHandler(_PATCH)
export const DELETE = withErrorHandler(_DELETE)
