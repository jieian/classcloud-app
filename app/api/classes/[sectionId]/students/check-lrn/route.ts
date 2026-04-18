import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
const _GET = async function(
  request: Request,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { searchParams } = new URL(request.url);
  const lrn = searchParams.get("lrn")?.trim() ?? "";
  if (!/^\d{12}$/.test(lrn))
    return Response.json(
      { error: "LRN must be exactly 12 numeric digits." },
      { status: 400 },
    );


  // Look up the student — include soft-deleted (admin bypasses RLS)
  const { data: studentRaw, error: studentErr } = await admin
    .from("students")
    .select("lrn, last_name, first_name, middle_name, sex, full_name, deleted_at")
    .eq("lrn", lrn)
    .maybeSingle();

  if (studentErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  if (!studentRaw) {
    return Response.json({ status: "not_found", student: null });
  }

  const s = studentRaw as any;
  const student = {
    lrn: s.lrn as string,
    last_name: (s.last_name ?? "") as string,
    first_name: (s.first_name ?? "") as string,
    middle_name: (s.middle_name ?? "") as string,
    sex: s.sex as "M" | "F",
    full_name: (s.full_name ?? "") as string,
  };

  if (s.deleted_at !== null) {
    return Response.json({ status: "deleted", student });
  }

  // Student is active — get this section's sy_id, then check enrollments
  const { data: sectionRaw } = await admin
    .from("sections")
    .select("sy_id")
    .eq("section_id", sectionId)
    .is("deleted_at", null)
    .maybeSingle();

  const syId = (sectionRaw as any)?.sy_id;

  if (syId) {
    // Find ANY active enrollment for this student in the active school year.
    // Include adviser_id on the from_section so we can compute transfer flags.
    const { data: enrollmentRaw } = await admin
      .from("enrollments")
      .select("section_id, sections(name, adviser_id, grade_levels(display_name))")
      .eq("lrn", lrn)
      .eq("sy_id", syId)
      .is("deleted_at", null)
      .maybeSingle();

    if (enrollmentRaw) {
      const e = enrollmentRaw as any;

      if (e.section_id === sectionId) {
        return Response.json({ status: "already_enrolled", student });
      }

      // Enrolled in a DIFFERENT section → enrolled_elsewhere
      const sec = Array.isArray(e.sections) ? e.sections[0] : e.sections;
      const gl = sec?.grade_levels;
      const gradeDisplay = Array.isArray(gl)
        ? (gl[0]?.display_name ?? "")
        : (gl?.display_name ?? "");

      const fromAdviserUid = (sec?.adviser_id ?? null) as string | null;
      const hasAdviser = fromAdviserUid !== null;

      // self_adviser: the requesting user is ALSO the adviser of the from_section,
      // meaning they can approve it themselves — skip the request flow.
      const selfAdviser = hasAdviser && fromAdviserUid === user.id;

      // Check for any existing PENDING transfer request for this student.
      // Run in parallel with nothing else here — single round-trip.
      const { data: pendingReq } = await admin
        .from("section_transfer_requests")
        .select("request_id")
        .eq("lrn", lrn)
        .eq("status", "PENDING")
        .maybeSingle();

      return Response.json({
        status: "enrolled_elsewhere",
        student,
        current_section: {
          section_id: e.section_id as number,
          name: (sec?.name ?? "") as string,
          grade_level_display: gradeDisplay,
          has_adviser: hasAdviser,
          self_adviser: selfAdviser,
          has_pending_request: pendingReq !== null,
        },
      });
    }
  }

  return Response.json({ status: "active", student });
}

export const GET = withErrorHandler(_GET)
