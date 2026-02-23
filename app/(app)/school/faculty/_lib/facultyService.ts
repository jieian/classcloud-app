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
