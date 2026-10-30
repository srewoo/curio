import type { ChapterMastery } from '@/types/mastery';
import { isMastered, isStruggling } from './mastery';
import { isDue } from './scheduler';

// Parent-facing weekly snapshot across all chapters. Derived on the fly from
// mastery data — nothing extra is stored.
export interface WeeklySummary {
  readonly practiceCount: number; // concept attempts in the last 7 days
  readonly activeDays: number; // distinct days with practice in the last 7
  readonly mastered: number;
  readonly learning: number; // practised, not yet mastered
  readonly due: number;
  readonly struggling: readonly { chapter: string; concept: string }[];
}

const WEEK_MS = 7 * 86_400_000;

export function weeklySummary(chapters: readonly ChapterMastery[], now: Date): WeeklySummary {
  const since = now.getTime() - WEEK_MS;
  let practiceCount = 0;
  let mastered = 0;
  let learning = 0;
  let due = 0;
  const days = new Set<string>();
  const struggling: { chapter: string; concept: string }[] = [];

  for (const ch of chapters) {
    for (const c of ch.concepts) {
      const st = ch.states[c.id];
      for (const a of st?.attempts ?? []) {
        if (Date.parse(a.at) >= since) {
          practiceCount++;
          days.add(a.at.slice(0, 10));
        }
      }
      if (isMastered(st)) mastered++;
      else if (st && st.attempts.length > 0) learning++;
      if (isDue(st, now)) due++;
      if (isStruggling(st)) struggling.push({ chapter: ch.title, concept: c.name });
    }
  }
  return { practiceCount, activeDays: days.size, mastered, learning, due, struggling };
}
