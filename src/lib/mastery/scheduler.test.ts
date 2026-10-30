import { describe, expect, it } from 'vitest';
import type { ChapterMastery } from '@/types/mastery';
import { applyResults, countDue, dueCards, dueIndex, INTERVAL_DAYS, isDue, nextState } from './scheduler';

const DAY = 86_400_000;
const t0 = new Date('2026-01-01T09:00:00Z');
const at = (days: number): Date => new Date(t0.getTime() + days * DAY);
const daysUntil = (iso: string | null, from: Date): number => (Date.parse(iso!) - from.getTime()) / DAY;

describe('nextState', () => {
  it('first pass schedules the first rung of the ladder', () => {
    const s = nextState(undefined, 'fact', 1, t0);
    expect(s.step).toBe(0);
    expect(daysUntil(s.dueAt, t0)).toBe(INTERVAL_DAYS.fact[0]);
  });

  it('each spaced pass climbs one rung and stops at the top', () => {
    let s = nextState(undefined, 'skill', 1, t0);
    s = nextState(s, 'skill', 1, at(3));
    expect(daysUntil(s.dueAt, at(3))).toBe(7);
    s = nextState(s, 'skill', 1, at(10));
    s = nextState(s, 'skill', 1, at(24));
    expect(s.step).toBe(INTERVAL_DAYS.skill.length - 1);
    expect(daysUntil(s.dueAt, at(24))).toBe(14);
  });

  it('a miss drops to relearning, due tomorrow, and restarts the ladder', () => {
    let s = nextState(undefined, 'idea', 1, t0);
    s = nextState(s, 'idea', 0.2, at(3));
    expect(s.step).toBe(-1);
    expect(daysUntil(s.dueAt, at(3))).toBe(1);
    s = nextState(s, 'idea', 1, at(4));
    expect(s.step).toBe(0);
  });

  it('a same-sitting pass is recorded but does not push the review out', () => {
    const first = nextState(undefined, 'fact', 1, t0);
    const again = nextState(first, 'fact', 1, new Date(t0.getTime() + 3_600_000));
    expect(again.dueAt).toBe(first.dueAt);
    expect(again.attempts).toHaveLength(2);
  });

  it('keeps at most five attempts', () => {
    let s = nextState(undefined, 'fact', 1, t0);
    for (let i = 1; i <= 7; i++) s = nextState(s, 'fact', 1, at(i * 10));
    expect(s.attempts).toHaveLength(5);
  });
});

describe('chapter helpers', () => {
  const chapter: ChapterMastery = {
    key: 'water',
    title: 'Water',
    concepts: [
      { id: 'c1', name: 'Evaporation', kind: 'idea', front: '?', back: '!' },
      { id: 'c2', name: 'Condensation', kind: 'fact', front: '?', back: '!' },
    ],
    states: {},
    updatedAt: '',
  };

  it('applyResults averages per concept and ignores unknown ids', () => {
    const next = applyResults(chapter, [
      { conceptId: 'c1', score: 1 },
      { conceptId: 'c1', score: 0 },
      { conceptId: 'zz', score: 1 },
    ], t0);
    expect(next.states.c1?.attempts[0]?.score).toBe(0.5);
    expect(next.states.c1?.step).toBe(-1); // 0.5 < pass
    expect(next.states.c2).toBeUndefined();
  });

  it('dueCards / dueIndex / countDue agree on what is due', () => {
    const next = applyResults(chapter, [{ conceptId: 'c2', score: 1 }], t0); // due in 1 day
    expect(dueCards([next], at(0.5))).toHaveLength(0);
    expect(dueCards([next], at(1))).toHaveLength(1);
    expect(isDue(next.states.c2, at(1))).toBe(true);
    expect(countDue(dueIndex([next]), at(1))).toBe(1);
    expect(countDue(dueIndex([next]), at(0.5))).toBe(0);
  });
});
