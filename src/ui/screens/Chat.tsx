import { useEffect, useRef, useState } from 'react';
import { useCurio } from '@/state/store';
import { effectiveTutorMode } from '@/types/settings';
import { Icon } from '@/ui/components/Icon';
import { ChatBubble, StreamingBubble } from '@/ui/components/ChatBubble';
import { useDictation } from '@/ui/hooks/useDictation';
import { PuzzleCard } from './Puzzle';
import { chatToMarkdown, downloadText, safeFileName } from '@/lib/export/markdown';

const SHOW_ANSWER = 'Please show me the full worked answer now.';

// Chat tutor (mockup screen 3). Streams-in via the store; shows follow-ups and
// injects a puzzle every 5th turn. Learning actions: explain it back, cards.
export function Chat(): JSX.Element {
  const {
    summary, history, thinking, turnsUntilPuzzle, puzzle, ask, dismissPuzzle, notePuzzleResult, startAssessment,
    clearChapter, backToLibrary, settings, streamingText, concepts, chapterKey, explainTarget, startExplain,
    cancelExplain, startReview, sourcesFor, canPlace, startPlacement, bookKey, openBookChapters, ingestNote,
  } = useCurio();
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [input, setInput] = useState('');
  const [placementDismissed, setPlacementDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dictation = useDictation(settings.language, setInput);
  const hintMode = effectiveTutorMode(settings) === 'hints';
  const lastTurn = history[history.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, thinking, puzzle, streamingText]);

  function submit(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput('');
    void ask(trimmed);
  }

  return (
    <div className="flex flex-col min-h-[340px]">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="w-7 h-7 rounded-lg bg-sage text-sage-ink flex items-center justify-center"><Icon name="book" /></div>
        <div className="text-[15px] font-medium tracking-tight">{summary?.title ?? 'Your chapter'}</div>
        <span className="ml-auto text-[11px] text-ink-3 bg-paper-2 px-2.5 py-1 rounded-full border border-line whitespace-nowrap">
          {turnsUntilPuzzle} of 5 until next puzzle
        </span>
        <button className="curio-btn py-1.5 px-3 text-xs" onClick={backToLibrary} disabled={thinking} title="Go back to the library upload screen">
          <Icon name="home" size={13} /> Library
        </button>
        {bookKey && (
          <button className="curio-btn py-1.5 px-3 text-xs" onClick={() => void openBookChapters(bookKey)} disabled={thinking} title="Pick another chapter from this book">
            <Icon name="book" size={13} /> Chapters
          </button>
        )}
        {history.length > 0 && (
          <button
            className="curio-btn py-1.5 px-3 text-xs"
            onClick={() => downloadText(safeFileName(summary?.title ?? 'curio', 'md'), chatToMarkdown(summary?.title ?? 'Study session', history, new Date()))}
            title="Save this conversation as a Markdown file"
          >
            <Icon name="file" size={13} /> Export
          </button>
        )}
        {chapterKey && concepts.length > 0 && (
          <button className="curio-btn py-1.5 px-3 text-xs" onClick={() => startReview(chapterKey)} disabled={thinking} title="Practise this chapter's flashcards">
            <Icon name="cards" size={13} /> Cards
          </button>
        )}
        <button className="curio-btn py-1.5 px-3 text-xs" onClick={() => void startAssessment()} disabled={thinking} title="Take an end-of-chapter quiz">
          <Icon name="bulb" size={13} /> Test me
        </button>
        <button
          className="curio-btn py-1.5 px-3 text-xs border border-red-line text-red-ink hover:bg-red-tint hover:border-red-ink"
          onClick={clearChapter}
          disabled={thinking}
          title="Discard this chapter and delete session data"
        >
          <Icon name="trash" size={13} /> Discard
        </button>
      </div>

      {ingestNote && !noteDismissed && (
        <div className="mb-3 rounded-lg bg-amber-tint text-amber-ink text-xs px-3 py-2 flex items-start gap-2" role="status">
          <span className="flex-1">{ingestNote}</span>
          <button className="underline" onClick={() => setNoteDismissed(true)}>OK</button>
        </div>
      )}

      {canPlace && !placementDismissed && (
        <div className="curio-card p-4 mb-3 flex items-center gap-3 bg-sage-tint border-sage-line">
          <div className="flex-1">
            <div className="text-sm font-medium">New chapter! Take a 1-minute check first?</div>
            <div className="text-xs text-ink-2 mt-0.5">Curio will skip what you already know and focus on the rest. There's no score.</div>
          </div>
          <button className="curio-btn" onClick={() => setPlacementDismissed(true)}>Not now</button>
          <button className="curio-btn curio-btn-primary" onClick={() => void startPlacement()}>Start check</button>
        </div>
      )}

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
          <ChatBubble key={turn.id} turn={turn} onFollowUp={submit} sourcesFor={sourcesFor} language={settings.language} age={settings.ageBand} />
        ))}
        {streamingText && <StreamingBubble text={streamingText} />}
        {thinking && !streamingText && <div className="self-start text-sm text-ink-3 italic">Curio is thinking…</div>}
        {puzzle && <PuzzleCard puzzle={puzzle} onDone={dismissPuzzle} onAnswered={notePuzzleResult} />}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {hintMode && !thinking && !explainTarget && lastTurn?.role === 'tutor' && lastTurn.explainScore === undefined && (
          <button className="curio-pill" onClick={() => submit(SHOW_ANSWER)}>Show me the full answer</button>
        )}
        {concepts.length > 0 && !thinking && !explainTarget && (
          <button className="curio-pill" onClick={startExplain} title="Explain an idea in your own words">Explain it back</button>
        )}
        {explainTarget && (
          <span className="text-[12px] text-[#0F6E56] bg-sage-tint rounded-full px-3 py-1.5 flex items-center gap-2">
            Explaining: <b>{explainTarget.name}</b>
            <button className="text-ink-3 hover:text-ink underline" onClick={cancelExplain}>skip</button>
          </span>
        )}
      </div>

      {dictation.error && <p className="text-xs text-amber-ink mt-2">{dictation.error}</p>}
      <div className="flex gap-2 items-center pt-4 mt-3 -mx-8 px-3 pb-1 border-t border-line bg-paper-2">
        <input
          className="curio-input flex-1"
          placeholder={explainTarget ? 'Explain it in your own words…' : 'Ask about the chapter…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(input); }}
        />
        {settings.voiceInput && dictation.supported && (
          <button
            className={`w-9 h-9 rounded-lg flex items-center justify-center border ${dictation.listening ? 'bg-amber-tint text-amber-ink border-amber-ink/30' : 'border-line-2 text-ink-2'}`}
            aria-label={dictation.listening ? 'Stop listening' : 'Speak your question'}
            aria-pressed={dictation.listening}
            onClick={dictation.toggle}
          >
            <Icon name="mic" size={16} />
          </button>
        )}
        <button className="bg-sage text-sage-ink w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50" aria-label="Send" disabled={thinking} onClick={() => submit(input)}>
          <Icon name="arrow-up" />
        </button>
      </div>
    </div>
  );
}
