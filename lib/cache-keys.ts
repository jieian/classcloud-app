/**
 * Centralised Redis cache key strings.
 * Import from here instead of scattering string literals across route files
 * to prevent typo-based invalidation misses in redis.del() calls.
 *
 * Usage:
 *   redis.get(REDIS_KEYS.FACULTY_LIST)
 *   redis.del(REDIS_KEYS.FACULTY_LIST, REDIS_KEYS.FACULTY_CANDIDATES)
 *   redis.del(REDIS_KEYS.announcements(syId))
 */
export const REDIS_KEYS = {
  FACULTY_LIST: "faculty:list",
  FACULTY_GSL: "faculty:gsl",
  FACULTY_CANDIDATES: "faculty:candidates",
  COORDINATOR_GROUPS: "coordinator:groups",
  USERS_ACTIVE: "users:active",
  USERS_PENDING: "users:pending",
  ROLES_ALL: "roles:all",
  ACTIVE_CONTEXT: "sys:active_context",
  announcements: (syId: number) => `announcements:${syId}`,
  permissionsVersion: (uid: string) => `permissions:version:${uid}`,
  profileAssignments: (uid: string) => `profile:assignments:${uid}`,
} as const;
