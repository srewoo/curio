import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';

// Pick a chapter: shown for books with a table of contents, multi-chapter
// uploads (src/lib/ingest/chapters.ts), and when reopening a saved book.
export function Chapters(): JSX.Element {
  const { chapterChoices, selectChapterSpan, backToLibrary } = useCurio();
  const spans = chapterChoices?.spans ?? [];
  if (!chapterChoices || spans.length === 0) return <div className="text-sm text-ink-2">Loading…</div>;

  const whole = {
    id: 'whole',
    title: chapterChoices.bookTitle ?? 'The whole upload',
    startPage: Math.min(...spans.map((s) => s.startPage)),
    endPage: Math.max(...spans.map((s) => s.endPage)),
  };

  return (
    <div>
      <Brand tag={chapterChoices.bookTitle ?? 'Looks like more than one chapter'} icon="book" />
      <h1 className="text-xl font-medium tracking-tight mb-1.5">Which chapter do you want to learn?</h1>
      <p className="text-sm text-ink-2 leading-relaxed mb-5">
        Curio works best focused on one chapter at a time. The book is saved, so you can come back for the next chapter any time.
      </p>

      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
        {spans.map((span) => {
          const locked = chapterChoices.unavailable.has(span.id);
          return (
            <button
              key={span.id}
              className="text-left curio-card p-3.5 hover:bg-paper-2 flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={locked}
              onClick={() => void selectChapterSpan(span)}
            >
              <div className="w-8 h-8 rounded-lg bg-sage-tint text-[#0F6E56] flex items-center justify-center flex-shrink-0">
                <Icon name={locked ? 'lock' : 'book'} size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{span.title}</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  {span.startPage === span.endPage ? `Page ${span.startPage}` : `Pages ${span.startPage}–${span.endPage}`}
                  {locked && ' · upload the book again to open this one'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-5">
        <button className="curio-btn" onClick={backToLibrary}>Back</button>
        {chapterChoices.allowWhole && (
          <button className="text-xs text-ink-3 underline" onClick={() => void selectChapterSpan(whole, true)}>
            Not right? Use the whole upload as one chapter instead
          </button>
        )}
      </div>
    </div>
  );
}
