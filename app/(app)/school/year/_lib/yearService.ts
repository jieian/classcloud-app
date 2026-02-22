import { getSupabase } from "@/lib/supabase/client";

export interface SchoolYear {
  sy_id: number;
  year_range: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  deleted_at: string | null;
}

export interface Quarter {
  quarter_id: number;
  name: string;
  is_active: boolean;
  sy_id: number;
}

/*
 * Fetches all school years from the database
 */
export async function getSchoolYears(): Promise<SchoolYear[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("school_years")
    .select("*")
    .is("deleted_at", null)
    .order("year_range", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as SchoolYear[]) ?? [];
}

/*
 * Updates the status of a specific school year.
 */
export async function updateYearStatus(sy_id: number, newStatus: boolean) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("school_years")
    .update({ is_active: newStatus })
    .eq("sy_id", sy_id);

  if (error) throw new Error(error.message);
}

/*
 * Fetches all quarters for a given school year.
 */
export async function getQuartersByYear(sy_id: number): Promise<Quarter[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("quarters")
    .select("*")
    .eq("sy_id", sy_id)
    .order("quarter_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as Quarter[]) ?? [];
}

/*
 * Updates a school year and its quarters in a single atomic transaction
 * via the secure API route (uses service role + RPC).
 * Throws a DuplicateYearError if another school year with the same range exists.
 */
/*
 * Soft-deletes a school year and inactivates all its quarters atomically
 * via the secure API route (uses service role + RPC).
 */
export async function deleteSchoolYear(sy_id: number): Promise<void> {
  const response = await fetch("/api/schoolYear/delete-schoolYear", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sy_id }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to delete school year.");
  }
}

export class DuplicateYearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateYearError";
  }
}

/*
 * Creates a new school year and 4 default quarters atomically via RPC.
 * Both the year and all quarters are inactive by default.
 * Throws a DuplicateYearError if the year range already exists.
 */
export async function createSchoolYear(
  start_year: number,
  end_year: number,
): Promise<void> {
  const response = await fetch("/api/schoolYear/create-schoolYear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_year, end_year }),
  });

  const result = await response.json();

  if (response.status === 409) {
    throw new DuplicateYearError(
      result.error || "A school year with this range already exists.",
    );
  }

  if (!response.ok) {
    throw new Error(result.error || "Failed to create school year.");
  }
}

export async function updateSchoolYear(
  sy_id: number,
  start_year: number,
  end_year: number,
  is_active: boolean,
  quarters: Array<{ quarter_id: number; is_active: boolean }>,
): Promise<void> {
  const response = await fetch("/api/schoolYear/update-schoolYear", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sy_id, start_year, end_year, is_active, quarters }),
  });

  const result = await response.json();

  if (response.status === 409) {
    throw new DuplicateYearError(
      result.error || "A school year with this range already exists.",
    );
  }

  if (!response.ok) {
    throw new Error(result.error || "Failed to update school year.");
  }
}