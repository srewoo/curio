import { useState } from 'react';
import type { Puzzle as PuzzleModel } from '@/types/session';
import { Icon } from '@/ui/components/Icon';
import { Rendered } from '@/ui/components/Rendered';

const KIND_LABEL: Record<PuzzleModel['kind'], string> = {
  mcq: 'Multiple choice',
  'fill-blank': 'Fill in the blank',
  'true-false': 'True or false',
};

// Quick-check puzzle card (mockup screen 4). Immediate feedback; skippable.
export function PuzzleCard({
  puzzle,
  onDone,
  onAnswered,
}: {
  puzzle: PuzzleModel;
  onDone: () => void;
  onAnswered?: (correct: boolean) => void;
}): JSX.Element {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const answered = picked !== null;

  return (
    <div className="curio-card p-5">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-tint text-amber-ink rounded-full text-[11px] font-medium mb-3">
        <Icon name="bulb" size={12} /> {KIND_LABEL[puzzle.kind]}
      </div>
      <p className="text-base font-medium leading-relaxed mb-4"><Rendered text={puzzle.question} /></p>

      {puzzle.kind === 'fill-blank' ? (
        <div className="flex gap-2">
          <input className="curio-input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" disabled={answered} />
          <button className="curio-btn curio-btn-primary" onClick={() => { setPicked(0); onAnswered?.(true); }} disabled={answered || !text.trim()}>Check</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {puzzle.choices.map((choice, i) => {
            const isCorrect = i === puzzle.correctIndex;
            const show = answered && (isCorrect || i === picked);
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => { setPicked(i); onAnswered?.(i === puzzle.correctIndex); }}
                className={`text-left px-3.5 py-3 rounded-lg border text-sm flex items-center gap-2.5 ${
                  show && isCorrect ? 'bg-sage-tint border-sage-line' : show ? 'bg-amber-tint border-amber-ink/30' : 'bg-paper border-line'
                }`}
              >
                <span className="w-5.5 h-5.5 rounded-md bg-card border border-line-2 flex items-center justify-center text-[11px] text-ink-3 px-1.5 py-0.5">
                  {String.fromCharCode(65 + i)}
                </span>
                <Rendered text={choice} />
              </button>
            );
          })}
        </div>
      )}

      {answered && (
        <div className="mt-4 text-sm text-ink-2">
          <span className="font-medium text-ink">{picked === puzzle.correctIndex ? 'Nice! ' : 'Good try. '}</span>
          <Rendered text={puzzle.explanation} />
        </div>
      )}

      <div className="mt-3.5 text-xs text-ink-3 text-center">
        {answered ? (
          <button className="text-[#0F6E56] underline" onClick={onDone}>Continue</button>
        ) : (
          <button className="text-[#0F6E56] underline" onClick={onDone}>Skip this puzzle</button>
        )}
      </div>
    </div>
  );
}
