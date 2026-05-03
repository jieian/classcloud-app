export interface TeachingSubject {
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
  sections: string[];
}

export interface FacultyMember {
  uid: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  advisory_section: {
    section_id: string;
    section_name: string;
    grade_level_display: string;
  } | null;
  teaching_subjects: TeachingSubject[];
}

export interface SubjectCoordinatorMember {
  curriculum_subject_id: number;
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
  grade_level_number?: number | null;
}

export interface SubjectCoordinatorRow {
  subject_group_id: number;
  name: string;
  description: string | null;
  coordinator: {
    uid: string;
    first_name: string;
    last_name: string;
  } | null;
  members: SubjectCoordinatorMember[];
}

export async function fetchFaculty(): Promise<FacultyMember[]> {
  const response = await fetch("/api/faculty/list", {
    method: "GET",
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error || "Failed to fetch faculty.");
  }

  return (result?.data as FacultyMember[]) ?? [];
}

export async function fetchSubjectCoordinatorGroups(): Promise<SubjectCoordinatorRow[]> {
  const response = await fetch("/api/faculty/subject-coordinators", {
    method: "GET",
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error || "Failed to fetch subject coordinator groups.");
  }

  return (result?.data as SubjectCoordinatorRow[]) ?? [];
}

export async function fetchCoordinatorCandidates(): Promise<FacultyMember[]> {
  const response = await fetch("/api/faculty/subject-coordinators/candidates", {
    method: "GET",
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error || "Failed to fetch coordinator candidates.");
  }

  return (result?.data as FacultyMember[]) ?? [];
}

export async function assignSubjectCoordinator(
  subjectGroupId: number,
  userId: string,
): Promise<void> {
  const response = await fetch("/api/faculty/subject-coordinators/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_group_id: subjectGroupId, user_id: userId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error || "Failed to assign coordinator.");
  }
}

export async function removeAcademicLoad(facultyId: string): Promise<void> {
  const response = await fetch("/api/faculty/remove-load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ faculty_id: facultyId }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to remove academic load.");
  }
}
