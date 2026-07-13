import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';
import { Rendered } from '@/ui/components/Rendered';

// Graded results (PRD progress feature): overall score, rating out of 10, a
// short summary, and per-question feedback.
export function Results(): JSX.Element {
  const { assessmentResult, priorProgress, backToChat, startAssessment, clearChapter } = useCurio();
  if (!assessmentResult) {
    return (
      <div>
        <Brand title="Your score" icon="bulb" />
        <button className="curio-btn" onClick={backToChat}>Back to chat</button>
      </div>
    );
  }

  const { overallScore, ratingOutOf10, summary, items } = assessmentResult;
  const tone = overallScore >= 80 ? 'text-[#0F6E56]' : overallScore >= 50 ? 'text-amber-ink' : 'text-ink';
  const reviewTopics = items.filter((i) => i.score < 0.5).map((i) => i.question.question);
  // priorProgress is the snapshot from when this chapter was opened (before this
  // attempt was saved), so its last entry is the student's previous score.
  const prevAttempts = priorProgress?.attempts ?? [];
  const prevScore = prevAttempts.length >= 1 ? prevAttempts[prevAttempts.length - 1]!.score : null;
  const delta = prevScore === null ? null : overallScore - prevScore;

  return (
    <div>
      <Brand title="Your score" tag="End-of-chapter check" icon="bulb" />

      <div className="curio-card p-6 flex items-center gap-6 mb-4">
        <div className="flex flex-col items-center">
          <div className={`text-5xl font-semibold tracking-tight ${tone}`}>{overallScore}</div>
          <div className="text-xs text-ink-3 mt-1">out of 100</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1.5" aria-label={`${ratingOutOf10} out of 10`}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`w-4 h-1.5 rounded-full ${i < ratingOutOf10 ? 'bg-sage' : 'bg-line'}`} />
            ))}
            <span className="text-sm text-ink-2 ml-2">{ratingOutOf10}/10</span>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed">{summary}</p>
          {delta !== null && (
            <p className={`text-xs mt-1.5 ${delta >= 0 ? 'text-[#0F6E56]' : 'text-amber-ink'}`}>
              {delta >= 0 ? `▲ Up ${delta} from last time (${prevScore}).` : `▼ Down ${-delta} from last time (${prevScore}).`}
            </p>
          )}
        </div>
      </div>

      {reviewTopics.length > 0 && (
        <div className="curio-card p-4 mb-4">
          <div className="text-[11px] text-ink-3 uppercase tracking-wide mb-2">Topics to review — Curio will focus on these next time</div>
          <div className="flex flex-wrap gap-2">
            {reviewTopics.map((t, i) => (
              <span key={i} className="text-[13px] bg-amber-tint text-amber-ink rounded-full px-3 py-1"><Rendered text={t} /></span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => {
          const good = item.score >= 0.75;
          const ok = item.score >= 0.5;
          return (
            <div key={item.question.id} className="curio-card p-4">
              <div className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${good ? 'bg-sage-tint text-[#0F6E56]' : ok ? 'bg-amber-tint text-amber-ink' : 'bg-[#F1EFE8] text-ink-3'}`}>
                  <Icon name="check" size={12} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1"><span className="text-ink-3 mr-1.5">{i + 1}.</span><Rendered text={item.question.question} /></p>
                  <p className="text-[13px] text-ink-2"><Rendered text={item.feedback} /></p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-6">
        <button className="curio-btn" onClick={clearChapter}>New chapter</button>
        <div className="flex gap-2">
          <button className="curio-btn" onClick={() => void startAssessment()}>Try again</button>
          <button className="curio-btn curio-btn-primary" onClick={backToChat}>Back to chat</button>
        </div>
      </div>
    </div>
  );
}
