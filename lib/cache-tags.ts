/**
 * Centralised Next.js Data Cache tag strings.
 * Import from here instead of repeating string literals across server services
 * and API routes to prevent typo-based invalidation misses.
 *
 * Usage:
 *   cacheTag(CACHE_TAGS.SCHOOL_YEARS)
 *   revalidateTag(CACHE_TAGS.SCHOOL_YEARS, "minutes")
 */
export const CACHE_TAGS = {
  ACTIVE_CONTEXT: "active-context",
  SCHOOL_YEARS: "school-years",
  GRADE_LEVELS: "grade-levels",
  CURRICULUMS: "curriculums",
  SUBJECTS: "subjects",
  SECTIONS: "sections",
  FACULTY: "faculty",
  EXAMS: "exams",
  REPORTS: "reports",
  TEACHER_ASSIGNMENTS: "teacher-assignments",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

// Re-export legacy per-file named constants so existing imports keep compiling
// without needing to update every import site immediately.
export const ACTIVE_CONTEXT_CACHE_TAG = CACHE_TAGS.ACTIVE_CONTEXT;
export const SCHOOL_YEARS_CACHE_TAG = CACHE_TAGS.SCHOOL_YEARS;
export const SCHOOL_YEARS_FULL_CACHE_TAG = CACHE_TAGS.SCHOOL_YEARS;
export const CURRICULUM_CACHE_TAG = CACHE_TAGS.CURRICULUMS;
export const EXAMS_CACHE_TAG = CACHE_TAGS.EXAMS;
export const REPORTS_CACHE_TAG = CACHE_TAGS.REPORTS;
