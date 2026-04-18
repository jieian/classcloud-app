// Map gives O(1) lookup vs O(n) indexOf on every comparison
const FIXED_ROLE_MAP = new Map<string, number>([
  ["Principal", 0],
  ["Administrator", 1],
  ["Subject Coordinator", 2],
  ["Grade Level Coordinator", 3],
  ["Faculty", 4],
]);

// Bucket values for roles outside the fixed 5:
//   0 = !is_faculty && is_protected
//   1 = !is_faculty && !is_protected
//   2 = is_faculty && is_protected
//   3 = is_faculty && !is_protected

export function sortRoles<T extends { name: string; is_protected: boolean; is_faculty: boolean }>(
  roles: T[],
): T[] {
  return [...roles].sort((a, b) => {
    const ai = FIXED_ROLE_MAP.get(a.name) ?? -1;
    const bi = FIXED_ROLE_MAP.get(b.name) ?? -1;
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    const bucketA = (!a.is_faculty ? 0 : 2) + (a.is_protected ? 0 : 1);
    const bucketB = (!b.is_faculty ? 0 : 2) + (b.is_protected ? 0 : 1);
    if (bucketA !== bucketB) return bucketA - bucketB;
    return a.name.localeCompare(b.name);
  });
}
