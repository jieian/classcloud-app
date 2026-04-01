import {
  createServerSupabaseClient,
  getUserPermissions,
} from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
type ExamRow = {
  exam_id: number;
  title: string;
  total_items: number | null;
  exam_date: string | null;
};

type AssignmentRow = {
  id: number;
  section_id: number;
};

type EnrollmentRow = {
  enrollment_id: number;
  lrn: string;
  section_id: number;
  students:
    | { full_name: string | null; sex: "M" | "F" | null }
    | { full_name: string | null; sex: "M" | "F" | null }[]
    | null;
};

type ScoreRow = {
  enrollment_id: number;
  exam_assignment_id: number;
  calculated_score: number | null;
  graded_at: string | null;
};

function escapeCsv(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function getProficiency(percent: number): string {
  if (percent >= 90) return "Highly Proficient";
  if (percent >= 75) return "Proficient";
  if (percent >= 50) return "Nearly";
  if (percent >= 25) return "Low";
  return "Not";
}

const _GET = async function(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getUserPermissions(user.id);
  const hasAccess =
    permissions.includes("exams.full_access") ||
    permissions.includes("exams.limited_access");
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { examId: examIdRaw } = await params;
  const examId = Number(examIdRaw);
  if (!examId || Number.isNaN(examId)) {
    return Response.json({ error: "Invalid exam ID." }, { status: 400 });
  }


  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("exam_id, title, total_items, exam_date")
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .maybeSingle<ExamRow>();

  if (examError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if (!exam) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }

  const { data: assignments, error: assignmentError } = await admin
    .from("exam_assignments")
    .select("id, section_id")
    .eq("exam_id", examId)
    .returns<AssignmentRow[]>();

  if (assignmentError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const sectionIds = (assignments ?? []).map((a) => a.section_id);
  const assignmentBySection = new Map<number, number>();
  for (const row of assignments ?? []) {
    assignmentBySection.set(row.section_id, row.id);
  }

  if (sectionIds.length === 0) {
    const csv = [
      "Examination Results",
      `Exam Title,${escapeCsv(exam.title)}`,
      "LRN,Name,Scores,Level of Proficiency",
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${escapeCsv(exam.title).replace(/"/g, "")}_results.csv"`,
      },
    });
  }

  const { data: enrollments, error: enrollmentError } = await admin
    .from("enrollments")
    .select("enrollment_id, lrn, section_id, students!inner(full_name, sex)")
    .in("section_id", sectionIds)
    .is("deleted_at", null)
    .is("students.deleted_at", null)
    .returns<EnrollmentRow[]>();

  if (enrollmentError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: scoreRows, error: scoreError } = await admin
    .from("scores")
    .select("enrollment_id, exam_assignment_id, calculated_score, graded_at")
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false })
    .returns<ScoreRow[]>();

  if (scoreError) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const latestScoreByEnrollment = new Map<number, ScoreRow>();
  for (const row of scoreRows ?? []) {
    if (!latestScoreByEnrollment.has(row.enrollment_id)) {
      latestScoreByEnrollment.set(row.enrollment_id, row);
    }
  }

  const students = (enrollments ?? []).map((row) => {
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    const assignmentId = assignmentBySection.get(row.section_id);
    const latest = latestScoreByEnrollment.get(row.enrollment_id);
    const score =
      latest && assignmentId && latest.exam_assignment_id === assignmentId
        ? (latest.calculated_score ?? null)
        : null;
    return {
      lrn: row.lrn ?? "",
      full_name: student?.full_name ?? "",
      sex: (student?.sex ?? "M") as "M" | "F",
      score,
    };
  });

  const males = students
    .filter((s) => s.sex === "M")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const females = students
    .filter((s) => s.sex === "F")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const totalItems = exam.total_items ?? 0;
  const lines: string[] = [];
  lines.push("Examination Results");
  lines.push(`Exam Title,${escapeCsv(exam.title)}`);
  lines.push(`Exam Date,${escapeCsv(exam.exam_date ?? "")}`);
  lines.push(`Total Items,${escapeCsv(totalItems)}`);
  lines.push("");
  lines.push("LRN,Name,Scores,Level of Proficiency");

  const appendGroup = (
    label: string,
    rows: Array<{ lrn: string; full_name: string; score: number | null }>,
  ) => {
    if (rows.length === 0) return;
    lines.push(`${escapeCsv(label)},,,`);
    for (const row of rows) {
      const percent =
        row.score != null && totalItems > 0
          ? Math.round((row.score / totalItems) * 100)
          : null;
      const proficiency = percent == null ? "" : getProficiency(percent);
      const scoreValue = row.score == null ? "" : `${row.score} / ${totalItems}`;
      lines.push(
        [
          escapeCsv(row.lrn),
          escapeCsv(row.full_name.toUpperCase()),
          escapeCsv(scoreValue),
          escapeCsv(proficiency),
        ].join(","),
      );
    }
  };

  appendGroup(`Male (${males.length})`, males);
  appendGroup(`Female (${females.length})`, females);

  const csv = `\uFEFF${lines.join("\n")}`;
  const safeTitle = exam.title.replace(/[<>:"/\\|?*]/g, "_");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}_results.csv"`,
    },
  });
}

export const GET = withErrorHandler(_GET)
