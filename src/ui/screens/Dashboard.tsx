import { useState } from 'react';
import { useCurio } from '@/state/store';
import { Icon } from '@/ui/components/Icon';
import type { ChapterProgress } from '@/types/progress';

export function Dashboard(): JSX.Element {
  const { recentProgress, backToLibrary, clearProgress } = useCurio();
  const [confirmReset, setConfirmReset] = useState(false);

  // Calculate high-level stats
  const totalChapters = recentProgress.length;
  const totalQuizzes = recentProgress.reduce((sum, p) => sum + p.attempts.length, 0);
  
  const latestScores = recentProgress
    .map((p) => p.attempts[p.attempts.length - 1]?.score)
    .filter((s): s is number => s !== undefined);
  const averageScore = latestScores.length > 0 
    ? Math.round(latestScores.reduce((sum, s) => sum + s, 0) / latestScores.length)
    : 0;

  function renderSparkline(p: ChapterProgress): JSX.Element | null {
    const attempts = p.attempts;
    if (attempts.length === 0) return null;

    const width = 140;
    const height = 40;
    const paddingX = 10;
    const paddingY = 5;

    // Single attempt case
    if (attempts.length === 1) {
      const score = attempts[0]!.score;
      const y = height - paddingY - (score / 100) * (height - 2 * paddingY);
      return (
        <svg width={width} height={height} className="overflow-visible">
          <line 
            x1={paddingX} 
            y1={y} 
            x2={width - paddingX} 
            y2={y} 
            stroke="#8A8067" 
            strokeWidth={1.5} 
            strokeDasharray="3,3"
          />
          <circle cx={width / 2} cy={y} r={4} fill="#8A8067" />
        </svg>
      );
    }

    // Multiple attempts: map points to SVG viewport coordinates
    const points = attempts.map((a, i) => {
      const x = paddingX + (i / (attempts.length - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (a.score / 100) * (height - 2 * paddingY);
      return { x, y };
    });

    const linePath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L ${points[points.length - 1]!.x.toFixed(1)} ${height} L ${points[0]!.x.toFixed(1)} ${height} Z`;

    return (
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${p.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8A8067" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8A8067" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#grad-${p.key})`} />
        <path d={linePath} fill="none" stroke="#8A8067" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((pt, idx) => (
          <circle 
            key={idx} 
            cx={pt.x} 
            cy={pt.y} 
            r={3} 
            fill="#8A8067" 
            className="hover:r-4 transition-all cursor-pointer"
          >
            <title>{`Attempt ${idx + 1}: ${attempts[idx]!.score}%`}</title>
          </circle>
        ))}
      </svg>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Performance Dashboard</h1>
          <p className="text-xs text-ink-3">Local-only encrypted tracking of your learning progress</p>
        </div>
        <button 
          className="curio-btn py-1.5 px-3 text-xs" 
          onClick={backToLibrary}
          title="Back to library"
        >
          <Icon name="book" size={13} /> Library
        </button>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-card border border-line p-3 rounded-xl text-center">
          <div className="text-xs text-ink-3 mb-1">Chapters Studied</div>
          <div className="text-xl font-bold tracking-tight text-ink">{totalChapters}</div>
        </div>
        <div className="bg-card border border-line p-3 rounded-xl text-center">
          <div className="text-xs text-ink-3 mb-1">Quizzes Taken</div>
          <div className="text-xl font-bold tracking-tight text-ink">{totalQuizzes}</div>
        </div>
        <div className="bg-card border border-line p-3 rounded-xl text-center">
          <div className="text-xs text-ink-3 mb-1">Average Score</div>
          <div className="text-xl font-bold tracking-tight text-ink">
            {totalQuizzes > 0 ? `${averageScore}%` : '—'}
          </div>
        </div>
      </div>

      {/* Progression List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {totalChapters === 0 ? (
          <div className="text-center py-12 bg-paper-2 rounded-xl border border-dashed border-line-2">
            <div className="text-ink-3 mb-2 flex justify-center"><Icon name="bulb" size={24} /></div>
            <p className="text-sm font-medium mb-1">No performance data yet</p>
            <p className="text-xs text-ink-3 max-w-[240px] mx-auto">
              Finish study sessions and take quiz assessments to build your progression curves!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recentProgress.map((p) => {
              const attempts = p.attempts;
              const startScore = attempts[0]?.score ?? 0;
              const latestScore = attempts[attempts.length - 1]?.score ?? 0;
              const gain = latestScore - startScore;

              return (
                <div key={p.key} className="bg-card border border-line p-3.5 rounded-xl">
                  {/* Title & Sparkline Curve */}
                  <div className="flex justify-between items-start gap-4 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-ink truncate" title={p.title}>
                        {p.title}
                      </h3>
                      <div className="text-xs text-ink-3 mt-1">
                        First score: <span className="font-medium text-ink-2">{startScore}%</span> · Latest: <span className="font-semibold text-ink">{latestScore}%</span>
                      </div>
                    </div>
                    {/* Visual Curve */}
                    <div className="flex-shrink-0 bg-paper px-2.5 py-1 rounded-lg border border-line-2 flex items-center justify-center min-h-[46px]">
                      {renderSparkline(p) ?? <span className="text-[10px] text-ink-3">No curve</span>}
                    </div>
                  </div>

                  {/* Gain Indicator & Weak Topics */}
                  <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-line-2 justify-between">
                    {/* Gain Badge */}
                    <div className="flex items-center gap-1.5">
                      {attempts.length > 1 && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          gain > 0 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : gain === 0 
                              ? 'bg-paper-2 text-ink-3 border border-line' 
                              : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                          {gain > 0 ? `+${gain}% gain` : gain === 0 ? 'no change' : `${gain}% drop`}
                        </span>
                      )}
                      {latestScore >= 80 && p.weakTopics.length === 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sage text-sage-ink border border-line whitespace-nowrap">
                          🎉 Mastered
                        </span>
                      )}
                    </div>

                    {/* Weak topics tag chips */}
                    {p.weakTopics.length > 0 && (
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-ink-3 mb-1 font-medium truncate">Topics to review:</div>
                        <div className="flex flex-wrap gap-1">
                          {p.weakTopics.slice(0, 3).map((topic, i) => (
                            <span 
                              key={i} 
                              className="text-[10px] text-ink-2 bg-paper-2 border border-line px-1.5 py-0.5 rounded max-w-[120px] truncate"
                              title={topic}
                            >
                              {topic}
                            </span>
                          ))}
                          {p.weakTopics.length > 3 && (
                            <span className="text-[9px] text-ink-3 font-medium self-center">
                              +{p.weakTopics.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Reset action */}
      {totalChapters > 0 && (
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
          {!confirmReset ? (
            <button 
              className="text-[11px] text-ink-3 hover:text-red-ink flex items-center gap-1 cursor-pointer transition-colors"
              onClick={() => setConfirmReset(true)}
            >
              <Icon name="trash" size={12} /> Clear Assessment History
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-red-ink font-medium">Permanently delete progress logs?</span>
              <button 
                className="curio-btn py-1 px-2 text-[10px] bg-red-line text-red-ink border-red-ink border"
                onClick={async () => {
                  await clearProgress();
                  setConfirmReset(false);
                }}
              >
                Yes, Delete
              </button>
              <button 
                className="curio-btn py-1 px-2 text-[10px]"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
