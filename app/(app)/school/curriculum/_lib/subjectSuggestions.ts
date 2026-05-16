import type { GradeLevel, WizardSubject } from "../create/_lib/types";

export interface SubjectSuggestionCandidate {
  key: string;
  groupName: string; // display name of the pattern group, e.g. "Mathematics"
  gradeLevelId: number;
  gradeLevelName: string;
  code: string;
  name: string;
  description: string;
  subject_type: "BOTH" | "SSES";
}

/** Strip trailing numeric suffix. "MATH1" → { base: "MATH", hasNumber: true } */
function stripTrailingNumber(str: string): { base: string; hasNumber: boolean } {
  const trimmed = str.trim();
  const m = trimmed.match(/^(.*?)[\s]?(\d+)$/);
  if (m && m[1].trim().length > 0) return { base: m[1].trim(), hasNumber: true };
  return { base: trimmed, hasNumber: false };
}

function normCode(code: string): string {
  return code.toUpperCase().replace(/\s/g, "");
}

/**
 * Detect cross-grade-level code patterns in the wizard's subject list and
 * return a candidate suggestion for every grade level missing from each group.
 *
 * Grouping is done by CODE base (e.g. "MATH" from "MATH1"/"MATH 2") rather
 * than name base, so subjects imported from other curricula with non-standard
 * names still participate in the same pattern as manually-created siblings.
 *
 * Only candidates whose inferred code does not already exist anywhere in the
 * wizard are returned (sync filter). Async DB verification is left to the
 * consuming component.
 */
export function detectSubjectPatterns(
  subjects: WizardSubject[],
  gradeLevels: GradeLevel[],
): SubjectSuggestionCandidate[] {
  if (subjects.length < 2 || gradeLevels.length < 2) return [];

  // O(S) — fast conflict lookup for all existing codes
  const occupiedCodes = new Set(subjects.map((s) => normCode(s.code)));

  // Group by normalised CODE base (e.g. "math" from "MATH1" or "math 2")
  // This is resilient to inconsistent subject naming across curricula.
  const groups = new Map<string, WizardSubject[]>();
  for (const s of subjects) {
    const { base } = stripTrailingNumber(normCode(s.code));
    if (!base) continue;
    const key = base.toLowerCase();
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const candidates: SubjectSuggestionCandidate[] = [];

  for (const [codeBaseKey, members] of groups) {
    const coveredGlIds = new Set(members.map((s) => s.grade_level_id));
    // A pattern must span at least 2 distinct grade levels
    if (coveredGlIds.size < 2) continue;

    // The code base is already the group key, uppercased
    const baseCode = codeBaseKey.toUpperCase();

    // For the display group name, prefer the name from a member that follows
    // the numbered-name convention (e.g. "Mathematics 2" → "Mathematics"),
    // falling back to the first member's name base.
    const memberWithNumberedName = members.find(
      (s) => stripTrailingNumber(s.name).hasNumber,
    );
    const { base: baseName, hasNumber: nameHasNumber } = stripTrailingNumber(
      (memberWithNumberedName ?? members[0]).name,
    );
    const groupName = baseName.replace(/\b\w/g, (c) => c.toUpperCase());

    // Pick a description source, preferring a member with a numbered name
    // (more likely to be consistently phrased)
    const sourceWithDesc =
      members.find((s) => stripTrailingNumber(s.name).hasNumber && s.description) ??
      members.find((s) => s.description);
    const rawDescription = sourceWithDesc?.description ?? "";
    const sourceGl = gradeLevels.find(
      (gl) => gl.grade_level_id === sourceWithDesc?.grade_level_id,
    );

    // subject_type: SSES only if every member is SSES, otherwise BOTH
    const subject_type: "BOTH" | "SSES" = members.every(
      (s) => s.subject_type === "SSES",
    )
      ? "SSES"
      : "BOTH";

    for (const gl of gradeLevels) {
      if (coveredGlIds.has(gl.grade_level_id)) continue;

      // Infer code as baseCode + level_number (e.g. MATH + 3 → MATH3)
      const inferredCode = `${baseCode}${gl.level_number}`;

      // Skip if this code conflicts with any subject already in the wizard
      if (occupiedCodes.has(normCode(inferredCode))) continue;

      // Adapt description: replace the source grade level's display name and
      // bare level number so "…for Grade 1…" becomes "…for Grade 3…"
      let description = rawDescription;
      if (sourceGl && sourceGl.grade_level_id !== gl.grade_level_id) {
        description = description
          .replace(new RegExp(sourceGl.display_name, "gi"), gl.display_name)
          .replace(
            new RegExp(`\\b${sourceGl.level_number}\\b`, "g"),
            String(gl.level_number),
          );
      }

      candidates.push({
        key: `${gl.grade_level_id}:${normCode(inferredCode)}`,
        groupName,
        gradeLevelId: gl.grade_level_id,
        gradeLevelName: gl.display_name,
        code: inferredCode,
        name: nameHasNumber ? `${baseName} ${gl.level_number}` : baseName,
        description,
        subject_type,
      });
    }
  }

  return candidates;
}
