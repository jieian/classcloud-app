export interface MasterlistSection {
  section_id: number;
  name: string;
  section_type: "SSES" | "REGULAR";
  adviser_id: string | null;
}

export interface MasterlistSubject {
  curriculum_subject_id: number;
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
}

export interface MasterlistGradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  sections: MasterlistSection[];
  subjects: MasterlistSubject[];
}

export interface MasterlistAssignment {
  section_id: number;
  curriculum_subject_id: number;
  teacher_id: string;
}

export interface MasterlistFacultyOption {
  uid: string;
  first_name: string;
  last_name: string;
}

export interface MasterlistTeacherLoad {
  curriculum_subject_id: number;
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
  isPending: boolean;
  sections: string[];
}

export interface MasterlistData {
  sy_id: number;
  grade_levels: MasterlistGradeLevel[];
  assignments: MasterlistAssignment[];
  faculty: MasterlistFacultyOption[];
}

export interface SaveMasterlistPayload {
  sy_id: number;
  adviser_changes: { section_id: number; adviser_id: string | null }[];
  assignment_changes: {
    section_id: number;
    curriculum_subject_id: number;
    teacher_id: string | null;
  }[];
}

export async function fetchMasterlistData(): Promise<MasterlistData> {
  const response = await fetch("/api/faculty/masterlist", {
    method: "GET",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to fetch masterlist data.");
  }
  return result as MasterlistData;
}

export async function saveMasterlist(payload: SaveMasterlistPayload): Promise<void> {
  const response = await fetch("/api/faculty/masterlist/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error || "Failed to save masterlist.");
  }
}
