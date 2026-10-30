import { describe, expect, it } from 'vitest';
import type { ChapterMastery, ConceptState } from '@/types/mastery';
import { computeMastery, isMastered, isStruggling, pickExplainConcept } from './mastery';

const state = (...scores: number[]): ConceptState => ({
  attempts: scores.map((score, i) => ({ at: new Date(2026, 0, i + 1).toISOString(), score })),
  step: 0,
  dueAt: null,
});

describe('computeMastery', () => {
  it('is 0 with no evidence', () => {
    expect(computeMastery([])).toBe(0);
  });

  it('caps one or two correct answers below mastery', () => {
    expect(computeMastery([1])).toBe(0.5);
    expect(computeMastery([1, 1])).toBe(0.8);
    expect(isMastered(state(1, 1))).toBe(false);
  });

  it('reaches mastery after three correct answers', () => {
    expect(computeMastery([1, 1, 1])).toBeCloseTo(1);
    expect(isMastered(state(1, 1, 1))).toBe(true);
  });

  it('weights recent attempts more (recovery is rewarded)', () => {
    expect(computeMastery([0, 0, 1, 1, 1])).toBeGreaterThan(computeMastery([1, 1, 1, 0, 0]));
  });

  it('only looks at the last five attempts and clamps scores', () => {
    expect(computeMastery([0, 0, 0, 1, 1, 1, 1, 1])).toBeCloseTo(1);
    expect(computeMastery([2, 2, 2])).toBeCloseTo(1);
  });
});

describe('isStruggling', () => {
  it('needs two attempts and low mastery', () => {
    expect(isStruggling(state(0))).toBe(false);
    expect(isStruggling(state(0, 0.2))).toBe(true);
    expect(isStruggling(state(1, 1))).toBe(false);
  });
});

describe('pickExplainConcept', () => {
  const concept = (id: string) => ({ id, name: id, kind: 'idea' as const, front: '', back: '' });
  const chapter = (states: Record<string, ConceptState>): ChapterMastery => ({
    key: 'k',
    title: 'K',
    concepts: [concept('a'), concept('b'), concept('c')],
    states,
    updatedAt: '',
  });

  it('prefers never-practised, then weakest, skipping mastered', () => {
    expect(pickExplainConcept(chapter({ a: state(1, 1, 1), b: state(0.4) }))?.id).toBe('c');
    expect(pickExplainConcept(chapter({ a: state(1, 1, 1), b: state(0.4), c: state(1) }))?.id).toBe('b');
  });

  it('returns null without a chapter', () => {
    expect(pickExplainConcept(null)).toBeNull();
  });
});
