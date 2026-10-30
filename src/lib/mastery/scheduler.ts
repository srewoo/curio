import type { ChapterMastery, Concept, ConceptKind, ConceptResult, ConceptState } from '@/types/mastery';

// Spaced review. Each concept kind has its own interval ladder (days); a pass
// climbs one rung, a miss drops to "relearning" and comes back tomorrow.
// ponytail: fixed ladders, not a fitted forgetting model (FSRS) — swap
// nextState alone if retention data ever justifies it.
export const INTERVAL_DAYS: Readonly<Record<ConceptKind, readonly number[]>> = {
  fact: [1, 3, 7, 14, 30, 60],
  idea: [3, 7, 14, 30],
  skill: [3, 7, 14],
};

export const PASS_SCORE = 0.6;
const DAY_MS = 86_400_000;
// A second pass within the same sitting is cramming, not a durable retrieval:
// it is recorded but does not push the next review further out.
const SAME_SESSION_MS = 6 * 3_600_000;
const MAX_ATTEMPTS = 5;

const iso = (ms: number): string => new Date(ms).toISOString();

export function nextState(prev: ConceptState | undefined, kind: ConceptKind, score: number, now: Date): ConceptState {
  const t = now.getTime();
  const attempts = [...(prev?.attempts ?? []), { at: iso(t), score }].slice(-MAX_ATTEMPTS);
  if (score < PASS_SCORE) return { attempts, step: -1, dueAt: iso(t + DAY_MS) };

  const last = prev?.attempts[prev.attempts.length - 1];
  if (prev?.dueAt && last && t - Date.parse(last.at) < SAME_SESSION_MS) {
    return { attempts, step: prev.step, dueAt: prev.dueAt };
  }
  const ladder = INTERVAL_DAYS[kind];
  const step = Math.min((prev?.step ?? -1) + 1, ladder.length - 1);
  return { attempts, step, dueAt: iso(t + ladder[step]! * DAY_MS) };
}

export function isDue(state: ConceptState | undefined, now: Date): boolean {
  return !!state?.dueAt && Date.parse(state.dueAt) <= now.getTime();
}

// Fold a batch of results into a chapter. Unknown concept ids are ignored;
// several results for one concept (e.g. two quiz questions) are averaged.
export function applyResults(chapter: ChapterMastery, results: readonly ConceptResult[], now: Date): ChapterMastery {
  const byId = new Map<string, number[]>();
  for (const r of results) byId.set(r.conceptId, [...(byId.get(r.conceptId) ?? []), r.score]);
  const states = { ...chapter.states };
  for (const c of chapter.concepts) {
    const scores = byId.get(c.id);
    if (!scores) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    states[c.id] = nextState(states[c.id], c.kind, avg, now);
  }
  return { ...chapter, states, updatedAt: now.toISOString() };
}

export interface DueCard {
  readonly chapterKey: string;
  readonly chapterTitle: string;
  readonly concept: Concept;
}

export function dueCards(chapters: readonly ChapterMastery[], now: Date): DueCard[] {
  return chapters.flatMap((ch) =>
    ch.concepts
      .filter((c) => isDue(ch.states[c.id], now))
      .map((concept) => ({ chapterKey: ch.key, chapterTitle: ch.title, concept })),
  );
}

// Content-free list of due timestamps — lets the service worker badge the
// toolbar icon without decrypting any chapter data.
export function dueIndex(chapters: readonly ChapterMastery[]): string[] {
  return chapters.flatMap((ch) => Object.values(ch.states).flatMap((s) => (s.dueAt ? [s.dueAt] : [])));
}

export function countDue(index: readonly string[], now: Date): number {
  return index.filter((d) => Date.parse(d) <= now.getTime()).length;
}
