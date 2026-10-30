import { describe, expect, it } from 'vitest';
import type { AssessmentQuestion, GradedItem } from '@/types/session';
import type { ChapterMastery } from '@/types/mastery';
import { NOT_SURE, needsPlacement, placementSplit, shapePlacement } from './placement';

const q = (id: string, conceptId?: string, kind: 'mcq' | 'text' = 'mcq'): AssessmentQuestion => ({
  id,
  kind,
  question: id,
  choices: kind === 'mcq' ? ['a', 'b', 'c', 'd'] : [],
  correctIndex: kind === 'mcq' ? 1 : -1,
  rubric: '',
  conceptId,
});
const concept = (id: string) => ({ id, name: id, kind: 'fact' as const, front: '', back: '' });

describe('shapePlacement', () => {
  it('keeps one mcq per concept, drops untagged/text, and appends "not sure"', () => {
    const out = shapePlacement([q('1', 'c1'), q('2', 'c1'), q('3'), q('4', 'c2', 'text'), q('5', 'c2')]);
    expect(out.map((x) => x.id)).toEqual(['1', '5']);
    expect(out[0]!.choices).toEqual(['a', 'b', 'c', 'd', NOT_SURE]);
    expect(out[0]!.correctIndex).toBe(1);
  });
});

describe('placementSplit', () => {
  it('splits concepts into known and still-to-learn', () => {
    const item = (conceptId: string, score: number): GradedItem => ({
      question: q(conceptId, conceptId),
      answer: { questionId: conceptId, choiceIndex: 0, text: '' },
      score,
      feedback: '',
    });
    const { known, toLearn } = placementSplit([item('c1', 1), item('c2', 0)], [concept('c1'), concept('c2'), concept('c3')]);
    expect(known.map((c) => c.id)).toEqual(['c1']);
    expect(toLearn.map((c) => c.id)).toEqual(['c2', 'c3']);
  });
});

describe('needsPlacement', () => {
  const chapter = (states: ChapterMastery['states']): ChapterMastery => ({
    key: 'k', title: 'K', concepts: [concept('c1')], states, updatedAt: '',
  });

  it('is true only for a chapter with concepts and no practice yet', () => {
    expect(needsPlacement(null)).toBe(false);
    expect(needsPlacement(chapter({}))).toBe(true);
    expect(needsPlacement(chapter({ c1: { attempts: [{ at: '', score: 1 }], step: 0, dueAt: null } }))).toBe(false);
    expect(needsPlacement({ ...chapter({}), concepts: [] })).toBe(false);
  });
});
