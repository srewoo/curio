import type { ProviderId } from '@/config/providers';
import type { AssessmentQuestion, Chunk, GradedItem } from '@/types/session';
import type { ChapterMastery, Concept } from '@/types/mastery';
import { generateAssessment } from '@/lib/assessment/generate';

// Opening placement check: one multiple-choice question per concept on a new
// chapter. Results seed mastery + the review schedule, so what the child
// already knows is reviewed later instead of taught first.

export const NOT_SURE = "I'm not sure yet";

// Offer placement only before any practice has been recorded for the chapter.
export function needsPlacement(chapter: ChapterMastery | null): boolean {
  return !!chapter && chapter.concepts.length > 0 && Object.values(chapter.states).every((s) => s.attempts.length === 0);
}

// Keep the first question for each concept; drop untagged ones. An honest
// "not sure" option is added so guessing doesn't count as knowing.
export function shapePlacement(questions: readonly AssessmentQuestion[]): AssessmentQuestion[] {
  const seen = new Set<string>();
  const out: AssessmentQuestion[] = [];
  for (const q of questions) {
    if (q.kind !== 'mcq' || !q.conceptId || seen.has(q.conceptId)) continue;
    seen.add(q.conceptId);
    out.push({ ...q, choices: [...q.choices, NOT_SURE] });
  }
  return out;
}

export function placementSplit(
  items: readonly GradedItem[],
  concepts: readonly Concept[],
): { known: Concept[]; toLearn: Concept[] } {
  const knownIds = new Set(items.filter((i) => i.score >= 1).map((i) => i.question.conceptId));
  return {
    known: concepts.filter((c) => knownIds.has(c.id)),
    toLearn: concepts.filter((c) => !knownIds.has(c.id)),
  };
}

export async function generatePlacement(
  provider: ProviderId,
  model: string,
  age: number,
  chunks: readonly Chunk[],
  concepts: readonly Concept[],
): Promise<AssessmentQuestion[]> {
  const qs = await generateAssessment(provider, model, age, chunks, { mcq: concepts.length, text: 0 }, [], concepts);
  return shapePlacement(qs);
}
