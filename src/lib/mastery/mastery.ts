import type { ChapterMastery, Concept, ConceptState } from '@/types/mastery';

// Mastery score: recency-weighted accuracy with a low-evidence cap, so one or
// two lucky answers can never declare a concept mastered. Newer attempts count
// more, so recovering after early mistakes is rewarded.
const RECENCY_WEIGHTS = [0.5, 0.7, 0.85, 0.95, 1] as const;
const CONFIDENCE_CAP: Readonly<Record<number, number>> = { 1: 0.5, 2: 0.8 };
export const MASTERED_AT = 0.85; // needs ≥ 3 attempts by construction
export const STRUGGLING_BELOW = 0.5;

export function computeMastery(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const recent = scores.slice(-RECENCY_WEIGHTS.length);
  const weights = RECENCY_WEIGHTS.slice(-recent.length);
  let sum = 0;
  let total = 0;
  recent.forEach((s, i) => {
    sum += weights[i]! * Math.max(0, Math.min(1, s));
    total += weights[i]!;
  });
  return Math.min(sum / total, CONFIDENCE_CAP[recent.length] ?? 1);
}

export function masteryOf(state: ConceptState | undefined): number {
  return computeMastery(state?.attempts.map((a) => a.score) ?? []);
}

export function isMastered(state: ConceptState | undefined): boolean {
  return masteryOf(state) >= MASTERED_AT;
}

// Practised at least twice and still below half — worth extra care.
export function isStruggling(state: ConceptState | undefined): boolean {
  return (state?.attempts.length ?? 0) >= 2 && masteryOf(state) < STRUGGLING_BELOW;
}

export function strugglingConcepts(chapter: ChapterMastery | null): Concept[] {
  return chapter ? chapter.concepts.filter((c) => isStruggling(chapter.states[c.id])) : [];
}

// Next concept to "explain it back": never-practised first, then lowest mastery;
// mastered concepts are skipped ("test out").
export function pickExplainConcept(chapter: ChapterMastery | null): Concept | null {
  if (!chapter) return null;
  const open = chapter.concepts.filter((c) => !isMastered(chapter.states[c.id]));
  const pool = open.length > 0 ? open : [...chapter.concepts];
  const rank = (c: Concept): number => {
    const st = chapter.states[c.id];
    return st && st.attempts.length > 0 ? masteryOf(st) : -1;
  };
  return [...pool].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
