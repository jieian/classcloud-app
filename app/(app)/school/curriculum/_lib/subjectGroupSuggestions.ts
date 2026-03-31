import type { WizardSubject } from "../create/_lib/types";

const SIMILARITY_THRESHOLD = 0.65;

function normalizeSubject(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter((token) => {
      if (/^\d+$/.test(token)) return false;
      if (/^(grade|gr\.?)$/.test(token)) return false;
      if (/^g\d+$/.test(token)) return false;
      if (/^(i{1,3}|iv|vi{0,3}|v|ix|x{1,3}|xi{0,3}|xii)$/.test(token)) return false;
      return true;
    });
}

function levenshteinSimilarity(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function matchSubject(
  canonicalStr: string,
  canonicalTokens: string[],
  tokenIndex: Map<string, Set<string>>,
): string | null {
  const candidates = new Set<string>();
  for (const token of canonicalTokens) {
    const indexed = tokenIndex.get(token);
    if (indexed) for (const key of indexed) candidates.add(key);
  }
  if (candidates.size === 0) return null;

  let bestKey: string | null = null;
  let bestScore = SIMILARITY_THRESHOLD;

  for (const key of candidates) {
    const lev = levenshteinSimilarity(canonicalStr, key);
    const jac = jaccardSimilarity(canonicalTokens, key.split(" "));
    const score = 0.5 * lev + 0.5 * jac;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
}

export function generateSuggestions(
  subjects: WizardSubject[],
): Array<{ tempId: string; name: string; memberTempIds: string[] }> {
  const clusters = new Map<string, WizardSubject[]>();
  const tokenIndex = new Map<string, Set<string>>();

  for (const subject of subjects) {
    const tokens = normalizeSubject(subject.name);
    if (tokens.length === 0) continue;
    const canonicalStr = tokens.join(" ");

    if (clusters.has(canonicalStr)) {
      clusters.get(canonicalStr)!.push(subject);
      continue;
    }

    const match = matchSubject(canonicalStr, tokens, tokenIndex);
    if (match) {
      clusters.get(match)!.push(subject);
    } else {
      clusters.set(canonicalStr, [subject]);
      for (const token of tokens) {
        if (!tokenIndex.has(token)) tokenIndex.set(token, new Set());
        tokenIndex.get(token)!.add(canonicalStr);
      }
    }
  }

  return Array.from(clusters.entries())
    .filter(([, members]) => members.length >= 2)
    .map(([canonical, members]) => ({
      tempId: `suggestion-${canonical}`,
      name: canonical.replace(/\b\w/g, (c) => c.toUpperCase()),
      memberTempIds: members.map((m) => m.tempId),
    }));
}
