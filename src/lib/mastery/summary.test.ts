import { describe, expect, it } from 'vitest';
import type { ChapterMastery, ConceptState } from '@/types/mastery';
import { weeklySummary } from './summary';

const now = new Date('2026-03-10T12:00:00Z');
const daysAgo = (d: number): string => new Date(now.getTime() - d * 86_400_000).toISOString();
const st = (dueAt: string | null, ...attempts: [number, number][]): ConceptState => ({
  attempts: attempts.map(([d, score]) => ({ at: daysAgo(d), score })),
  step: 0,
  dueAt,
});
const concept = (id: string) => ({ id, name: `name-${id}`, kind: 'fact' as const, front: '', back: '' });

describe('weeklySummary', () => {
  const chapter: ChapterMastery = {
    key: 'k',
    title: 'Plants',
    concepts: [concept('a'), concept('b'), concept('c'), concept('d')],
    states: {
      a: st(daysAgo(-5), [20, 1], [10, 1], [1, 1]), // mastered, 1 attempt this week
      b: st(daysAgo(1), [3, 0], [2, 0.2]), // struggling + due
      c: st(daysAgo(-1), [2, 1]), // learning
    },
    updatedAt: '',
  };

  it('counts practice, mastery, due and struggling concepts', () => {
    const s = weeklySummary([chapter], now);
    expect(s.practiceCount).toBe(4);
    expect(s.activeDays).toBe(3);
    expect(s.mastered).toBe(1);
    expect(s.learning).toBe(2);
    expect(s.due).toBe(1);
    expect(s.struggling).toEqual([{ chapter: 'Plants', concept: 'name-b' }]);
  });

  it('is all zeros with no data', () => {
    expect(weeklySummary([], now)).toEqual({ practiceCount: 0, activeDays: 0, mastered: 0, learning: 0, due: 0, struggling: [] });
  });
});
