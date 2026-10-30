import { useEffect, useState } from 'react';
import type { ChapterMastery } from '@/types/mastery';
import { loadAllMastery } from '@/lib/mastery/store';
import { masteryOf, MASTERED_AT } from '@/lib/mastery/mastery';
import { weeklySummary } from '@/lib/mastery/summary';

// Parent view on the Dashboard: this week's practice + per-concept mastery.
// All derived locally from encrypted mastery data.
export function LearningPanel({ refreshKey }: { refreshKey: unknown }): JSX.Element | null {
  const [chapters, setChapters] = useState<ChapterMastery[] | null>(null);

  useEffect(() => {
    void loadAllMastery().then(setChapters);
  }, [refreshKey]);

  if (!chapters || chapters.length === 0) return null;
  const week = weeklySummary(chapters, new Date());

  return (
    <div className="mb-5">
      <div className="curio-card p-4 mb-3">
        <div className="text-[11px] text-ink-3 uppercase tracking-wide mb-2.5">This week</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Practice" value={week.practiceCount} />
          <Stat label="Days active" value={`${week.activeDays}/7`} />
          <Stat label="Mastered" value={week.mastered} />
          <Stat label="Due now" value={week.due} />
        </div>
        {week.struggling.length > 0 && (
          <p className="text-xs text-amber-ink bg-amber-tint rounded-lg px-3 py-2 mt-3">
            Finding these hard: {week.struggling.slice(0, 4).map((s) => s.concept).join(', ')}
            {week.struggling.length > 4 ? ` and ${week.struggling.length - 4} more` : ''}. A chat about one of these could help.
          </p>
        )}
      </div>

      {chapters.map((ch) => (
        <div key={ch.key} className="curio-card p-3.5 mb-2">
          <div className="text-sm font-semibold truncate mb-2" title={ch.title}>{ch.title}</div>
          <div className="flex flex-col gap-1.5">
            {ch.concepts.map((c) => {
              const m = masteryOf(ch.states[c.id]);
              const pct = Math.round(m * 100);
              const done = m >= MASTERED_AT;
              return (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate text-ink-2" title={c.name}>{c.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} mastery`}>
                    <div className={`h-full rounded-full ${done ? 'bg-sage' : 'bg-[#8A8067]'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-ink-3">{done ? '✓' : `${pct}%`}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div>
      <div className="text-lg font-bold tracking-tight text-ink">{value}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}
