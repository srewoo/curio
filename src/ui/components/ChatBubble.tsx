import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ChatTurn, Chunk } from '@/types/session';
import { markdownToHtml } from '@/lib/render/markdown';
import { useMermaid } from '@/ui/hooks/useMermaid';
import { canSpeak, speak, stopSpeaking } from '@/lib/speech/speak';
import { Icon } from './Icon';

interface BubbleProps {
  readonly turn: ChatTurn;
  readonly onFollowUp: (t: string) => void;
  readonly sourcesFor: (turn: ChatTurn, page: number) => Chunk[];
  readonly language: string;
  readonly age: number;
}

// One chat message. Tutor turns get read-aloud, clickable page citations that
// open the source passage, and an "explain it back" score when graded.
export function ChatBubble({ turn, onFollowUp, sourcesFor, language, age }: BubbleProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<{ page: number; chunks: Chunk[] } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  useMermaid(containerRef, turn.role === 'tutor' ? turn.text : '');
  useEffect(() => () => stopSpeaking(), []);

  if (turn.role === 'user') {
    return <div className="self-end max-w-[88%] px-3.5 py-3 rounded-xl rounded-br bg-userbubble text-userink text-sm leading-relaxed">{turn.text}</div>;
  }

  function openCite(e: MouseEvent | KeyboardEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.curio-cite');
    if (!el) return;
    if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const page = Number(el.dataset.page);
    setSource(source?.page === page ? null : { page, chunks: sourcesFor(turn, page) });
  }

  function toggleSpeak(): void {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(turn.text, language, age, () => setSpeaking(false));
  }

  return (
    <div ref={containerRef} className="self-start max-w-[88%] px-3.5 py-3 rounded-xl rounded-bl bg-card border border-line text-sm leading-relaxed">
      {turn.webSources && (
        <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-ink bg-amber-tint rounded-full px-2.5 py-0.5">
          From the web — not from your chapter
        </div>
      )}
      <div className="curio-prose" onClick={openCite} onKeyDown={openCite} dangerouslySetInnerHTML={{ __html: markdownToHtml(turn.text) }} />
      {source && (
        <div className="mt-2.5 rounded-lg border border-sage-line bg-sage-tint px-3 py-2 text-[13px] text-ink-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-[#0F6E56]">From your chapter · page {source.page}</span>
            <button className="text-[11px] text-ink-3 hover:text-ink" onClick={() => setSource(null)}>Close</button>
          </div>
          {source.chunks.length > 0
            ? source.chunks.map((c) => <p key={c.id} className="whitespace-pre-wrap max-h-48 overflow-y-auto">{c.text}</p>)
            : <p>That passage isn't available any more.</p>}
        </div>
      )}
      {turn.webSources && turn.webSources.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="text-[11px] text-ink-3 mb-1">Sources</div>
          <ul className="flex flex-col gap-0.5">
            {turn.webSources.map((s) => (
              <li key={s.url} className="text-[12px] truncate">
                <a className="text-[#0F6E56] underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a>
                <span className="text-ink-3"> · {new URL(s.url).hostname}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {turn.searchEntryHtml && (
        // Google's markup is untrusted: no scripts, links open in a new tab.
        <iframe
          title="Google Search suggestions"
          className="mt-2 w-full h-[72px] border-0"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={`<base target="_blank">${turn.searchEntryHtml}`}
        />
      )}
      {turn.explainScore !== undefined && <ExplainBadge score={turn.explainScore} />}
      {turn.arithmeticFlag && (
        <div className="mt-2.5 text-[12px] text-amber-ink bg-amber-tint rounded-lg px-2.5 py-1.5">
          Heads up — double-check the arithmetic above; it didn't quite add up when Curio checked it.
        </div>
      )}
      {canSpeak() && (
        <button className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink" onClick={toggleSpeak} aria-pressed={speaking}>
          <Icon name="speaker" size={12} /> {speaking ? 'Stop reading' : 'Read aloud'}
        </button>
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

function ExplainBadge({ score }: { score: number }): JSX.Element {
  const label = score >= 0.85 ? 'You explained it really well!' : score >= 0.5 ? 'Nearly there — great start.' : "Let's keep working on this one.";
  return (
    <div className={`mt-2.5 text-[12px] rounded-lg px-2.5 py-1.5 ${score >= 0.5 ? 'bg-sage-tint text-[#0F6E56]' : 'bg-amber-tint text-amber-ink'}`}>
      {label} Curio will remind you to review it.
    </div>
  );
}

// Live, still-streaming tutor text (no citations/actions until it settles).
export function StreamingBubble({ text }: { text: string }): JSX.Element {
  return (
    <div className="self-start max-w-[88%] px-3.5 py-3 rounded-xl rounded-bl bg-card border border-line text-sm leading-relaxed">
      <div className="curio-prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />
    </div>
  );
}
