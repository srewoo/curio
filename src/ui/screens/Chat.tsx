import { useEffect, useRef, useState } from 'react';
import type { ChatTurn } from '@/types/session';
import { useCurio } from '@/state/store';
import { Icon } from '@/ui/components/Icon';
import { PuzzleCard } from './Puzzle';
import { markdownToHtml } from '@/lib/render/markdown';

// Chat tutor (mockup screen 3). Streams-in via the store; shows follow-ups and
// injects a puzzle every 5th turn.
export function Chat(): JSX.Element {
  const { summary, history, thinking, turnsUntilPuzzle, puzzle, ask, dismissPuzzle, notePuzzleResult, startAssessment } = useCurio();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, thinking, puzzle]);

  function submit(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput('');
    void ask(trimmed);
  }

  return (
    <div className="flex flex-col min-h-[340px]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-sage text-sage-ink flex items-center justify-center"><Icon name="book" /></div>
        <div className="text-[15px] font-medium tracking-tight">{summary?.title ?? 'Your chapter'}</div>
        <span className="ml-auto text-[11px] text-ink-3 bg-paper-2 px-2.5 py-1 rounded-full border border-line whitespace-nowrap">
          {turnsUntilPuzzle} of 5 until next puzzle
        </span>
        <button
          className="curio-btn py-1.5 px-3 text-xs"
          onClick={() => void startAssessment()}
          disabled={thinking}
          title="Take an end-of-chapter quiz"
        >
          <Icon name="bulb" size={13} /> Test me
        </button>
      </div>

      {history.length === 0 && summary && (
        <div className="curio-card p-4 mb-3">
          <p className="text-sm text-ink-2 leading-relaxed mb-3">{summary.overview}</p>
          <div className="text-[11px] text-ink-3 mb-1.5">Try one of these to start</div>
          <div className="flex flex-col gap-1.5">
            {summary.starters.map((s, i) => (
              <button key={i} className="text-left px-3 py-2 bg-card border border-line rounded-lg text-sm hover:bg-paper-2" onClick={() => submit(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3.5 flex-1">
        {history.map((turn) => (
          <Bubble key={turn.id} turn={turn} onFollowUp={submit} />
        ))}
        {thinking && <div className="self-start text-sm text-ink-3 italic">Curio is thinking…</div>}
        {puzzle && <PuzzleCard puzzle={puzzle} onDone={dismissPuzzle} onAnswered={notePuzzleResult} />}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 items-center pt-4 mt-4 -mx-8 px-3 pb-1 border-t border-line bg-paper-2">
        <input
          className="curio-input flex-1"
          placeholder="Ask about the chapter…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(input); }}
        />
        <button className="bg-sage text-sage-ink w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50" aria-label="Send" disabled={thinking} onClick={() => submit(input)}>
          <Icon name="arrow-up" />
        </button>
      </div>
    </div>
  );
}

function Bubble({ turn, onFollowUp }: { turn: ChatTurn; onFollowUp: (t: string) => void }): JSX.Element {
  if (turn.role === 'user') {
    return <div className="self-end max-w-[88%] px-3.5 py-3 rounded-xl rounded-br bg-userbubble text-userink text-sm leading-relaxed">{turn.text}</div>;
  }
  return (
    <div className="self-start max-w-[88%] px-3.5 py-3 rounded-xl rounded-bl bg-card border border-line text-sm leading-relaxed">
      <div className="curio-prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(turn.text) }} />
      {turn.arithmeticFlag && (
        <div className="mt-2.5 text-[12px] text-amber-ink bg-amber-tint rounded-lg px-2.5 py-1.5">
          Heads up — double-check the arithmetic above; it didn't quite add up when Curio checked it.
        </div>
      )}
      {turn.followUps && turn.followUps.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="text-[11px] text-ink-3 mb-0.5">Try one of these next</div>
          {turn.followUps.map((f, i) => (
            <button key={i} className="text-left px-3 py-2 bg-card border border-line rounded-lg text-sm hover:bg-paper-2" onClick={() => onFollowUp(f.text)}>{f.text}</button>
          ))}
        </div>
      )}
    </div>
  );
}
