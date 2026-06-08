import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import { dispatchDirectMove } from "@/lib/notifications";
import { parseBody, AddStudentSchema } from "@/lib/api-schemas";
import { isTeacherInSection } from "@/app/(app)/school/classes/_lib/classesServerService";

type NestedRelation<T> = T | T[] | null;

type SectionAccessRow = {
  sy_id: number;
  adviser_id: string | null;
};

type RosterSectionRow = {
  section_id: number;
  name: string;
  adviser_id: string | null;
  sy_id: number;
  grade_levels: NestedRelation<{ display_name: string | null }>;
};

type EnrollmentSectionRow = {
  section_id: number | null;
};

type RosterEnrollmentRow = {
  enrollment_id: number;
  lrn: string;
  students: NestedRelation<{
    lrn: string;
    full_name: string | null;
    sex: "M" | "F" | null;
  }>;
};

// ─── POST /api/classes/[sectionId]/students ──────────────────────────────────
// Adds a student to a class roster. Handles 5 actions:
//   new                  – create new student record + enroll
//   enroll               – enroll existing active student (no changes to student)
//   update_enroll        – update existing student info + enroll
//   restore_enroll       – restore soft-deleted student + enroll
//   restore_update_enroll – restore + update info + enroll

const _POST = async function(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });

  const parsed = parseBody(AddStudentSchema, await request.json());
  if (!parsed.success) return parsed.response;
  const { action, lrn, last_name, first_name, middle_name, sex: sexRaw } = parsed.data;

  // Validate name fields for actions that write to students table
  const needsNameFields = ["new", "update_enroll", "restore_update_enroll"].includes(action);
  const lastName = last_name ?? "";
  const firstName = first_name ?? "";
  const middleName = middle_name ?? "";
  const sex = sexRaw ?? "";

  if (needsNameFields) {
    if (!lastName || lastName.length < 2)
      return Response.json(
        { error: "Last name is required (min 2 chars)." },
        { status: 400 },
      );
    if (!firstName || firstName.length < 2)
      return Response.json(
        { error: "First name is required (min 2 chars)." },
        { status: 400 },
      );
    if (!["M", "F"].includes(sex))
      return Response.json({ error: "Sex must be M or F." }, { status: 400 });
  }


  // Fetch section once — covers both auth and sy_id needed below.
  const { data: sectionRaw } = await admin
    .from("sections")
    .select("sy_id, adviser_id")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sectionRaw)
    return Response.json({ error: "Section not found." }, { status: 404 });

  const section = sectionRaw as SectionAccessRow;

  // Non-student-admin users may only operate on sections they advise or teach in.
  const hasFullAccess = permissions.includes("students.full_access");
  if (!hasFullAccess && section.adviser_id !== user.id) {
    const isTeacher = await isTeacherInSection(user.id, sectionId);
    if (!isTeacher) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const syId = section.sy_id;

  // Helper: upsert enrollment — restores soft-deleted record or inserts new
  async function insertEnrollment(): Promise<Response | null> {
    const { error } = await admin.rpc("upsert_enrollment", {
      p_lrn: lrn,
      p_section_id: sectionId,
      p_sy_id: syId,
    });
    if (error) {
      if (error.code === "23505")
        return Response.json(
          { error: "This student is already enrolled in another class for this school year." },
          { status: 409 },
        );
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
    return null;
  }

  switch (action) {
    case "new": {
      const { error } = await admin.from("students").insert({
        lrn,
        last_name: lastName,
        first_name: firstName,
        middle_name: middleName || null,
        sex,
      });
      if (error) {
        if (error.code === "23505")
          return Response.json(
            { error: "A student with this LRN already exists." },
            { status: 409 },
          );
        return Response.json({ error: "Internal server error." }, { status: 500 });
      }
      const enrollErr = await insertEnrollment();
      if (enrollErr) return enrollErr;
      break;
    }

    case "enroll": {
      const enrollErr = await insertEnrollment();
      if (enrollErr) return enrollErr;
      break;
    }

    case "update_enroll": {
      const { error } = await admin
        .from("students")
        .update({
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName || null,
          sex,
        })
        .eq("lrn", lrn);
      if (error) return Response.json({ error: "Internal server error." }, { status: 500 });
      const enrollErr = await insertEnrollment();
      if (enrollErr) return enrollErr;
      break;
    }

    case "restore_enroll": {
      const { error } = await admin
        .from("students")
        .update({ deleted_at: null })
        .eq("lrn", lrn);
      if (error) return Response.json({ error: "Internal server error." }, { status: 500 });
      const enrollErr = await insertEnrollment();
      if (enrollErr) return enrollErr;
      break;
    }

    case "restore_update_enroll": {
      const { error } = await admin
        .from("students")
        .update({
          deleted_at: null,
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName || null,
          sex,
        })
        .eq("lrn", lrn);
      if (error) return Response.json({ error: "Internal server error." }, { status: 500 });
      const enrollErr = await insertEnrollment();
      if (enrollErr) return enrollErr;
      break;
    }

    // Move: atomically remove from current class + enroll in this class (RPC)
    case "move": {
      // Pre-fetch from-section BEFORE the RPC — old enrollment is soft-deleted atomically inside it
      const { data: currentEnroll } = await admin
        .from("enrollments")
        .select("section_id")
        .eq("lrn", lrn)
        .eq("sy_id", syId)
        .is("deleted_at", null)
        .maybeSingle();
      const fromSectionId = (currentEnroll as EnrollmentSectionRow | null)?.section_id ?? null;

      const { error } = await admin.rpc("move_student_enrollment", {
        p_lrn: lrn,
        p_sy_id: syId,
        p_section_id: sectionId,
      });
      if (error) {
        if (error.code === "23505")
          return Response.json(
            { error: "This student is already enrolled in this class." },
            { status: 409 },
          );
        return Response.json({ error: "Internal server error." }, { status: 500 });
      }
      // Cancel any open transfer requests — the student has already moved.
      await admin
        .from("section_transfer_requests")
        .update({ status: "CANCELLED", cancellation_reason: "MOVED_BY_ADMIN" })
        .eq("lrn", lrn)
        .eq("status", "PENDING");

      if (fromSectionId) {
        void dispatchDirectMove({ lrn, fromSectionId, toSectionId: sectionId, actorUid: user.id });
      }
      break;
    }

  }

  return Response.json({ success: true });
}

// ─── GET /api/classes/[sectionId]/students ────────────────────────────────────

const _GET = async function(
  _request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasAccess =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access") ||
    permissions.includes("classes.full_access");
  if (!hasAccess) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { sectionId: sectionIdStr } = await params;
  const sectionId = Number(sectionIdStr);
  if (!sectionId)
    return Response.json({ error: "Invalid section ID." }, { status: 400 });


  // Fetch section first; sy_id is needed before we can fetch enrollments.
  const { data: sectionRaw, error: secError } = await admin
    .from("sections")
    .select("section_id, name, adviser_id, sy_id, grade_levels(display_name)")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (secError)
    return Response.json({ error: "Internal server error." }, { status: 500 });
  if (!sectionRaw)
    return Response.json({ error: "Section not found." }, { status: 404 });

  // Non-student-admin users may only view rosters for sections they advise or teach in.
  const s = sectionRaw as RosterSectionRow;
  const hasStudentFullAccess = permissions.includes("students.full_access");
  if (!hasStudentFullAccess && s.adviser_id !== user.id) {
    const isTeacher = await isTeacherInSection(user.id, sectionId);
    if (!isTeacher) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const glRaw = s.grade_levels;
  const grade_level_display: string = Array.isArray(glRaw)
    ? (glRaw[0]?.display_name ?? "")
    : (glRaw?.display_name ?? "");
  const syId: number = s.sy_id;

  // Now fetch enrolled students for this section + school year
  const { data: enrollData, error: enrollErr } = await admin
    .from("enrollments")
    .select("enrollment_id, lrn, students!inner(lrn, full_name, sex)")
    .eq("section_id", sectionId)
    .eq("sy_id", syId)
    .is("deleted_at", null)
    .is("students.deleted_at", null)
    .order("lrn");

  if (enrollErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const students = ((enrollData ?? []) as RosterEnrollmentRow[]).map((e) => {
    const student = Array.isArray(e.students) ? e.students[0] : e.students;
    return {
      enrollment_id: e.enrollment_id as number,
      lrn: e.lrn as string,
      full_name: (student?.full_name ?? "") as string,
      sex: (student?.sex ?? "M") as "M" | "F",
    };
  });

  // Sort by last name (full_name is "Last, First Middle" generated format)
  students.sort((a, b) => a.full_name.localeCompare(b.full_name));

  return Response.json({
    section: {
      section_id: s.section_id as number,
      name: s.name as string,
      grade_level_display,
      adviser_id: (s.adviser_id ?? null) as string | null,
    },
    students,
  });
}

export const GET = withErrorHandler(_GET)
export const POST = withErrorHandler(_POST)
