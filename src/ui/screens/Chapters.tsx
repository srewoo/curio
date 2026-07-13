import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Icon } from '@/ui/components/Icon';

// Shown when the upload spans more than one chapter/section
// (src/lib/ingest/chapters.ts). The student picks one chapter to focus the
// tutor on — or uses the whole upload if the split isn't what they wanted.
export function Chapters(): JSX.Element {
  const { chapterSpans, selectChapterSpan } = useCurio();
  const spans = chapterSpans ?? [];
  if (spans.length === 0) return <div className="text-sm text-ink-2">Loading…</div>;

  const whole = {
    id: 'whole',
    title: 'The whole upload',
    startPage: Math.min(...spans.map((s) => s.startPage)),
    endPage: Math.max(...spans.map((s) => s.endPage)),
  };

  return (
    <div>
      <Brand tag="Looks like more than one chapter" icon="book" />
      <h1 className="text-xl font-medium tracking-tight mb-1.5">Which chapter do you want to learn?</h1>
      <p className="text-sm text-ink-2 leading-relaxed mb-5">
        Curio works best focused on one chapter at a time — pick the one you want to study now.
      </p>

      <div className="flex flex-col gap-2.5">
        {spans.map((span) => (
          <button
            key={span.id}
            className="text-left curio-card p-4 hover:bg-paper-2 flex items-center gap-3"
            onClick={() => void selectChapterSpan(span)}
          >
            <div className="w-8 h-8 rounded-lg bg-sage-tint text-[#0F6E56] flex items-center justify-center flex-shrink-0">
              <Icon name="book" size={15} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-ink">{span.title}</div>
              <div className="text-xs text-ink-3 mt-0.5">
                {span.startPage === span.endPage ? `Page ${span.startPage}` : `Pages ${span.startPage}–${span.endPage}`}
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        className="text-xs text-ink-3 underline mt-5 block"
        onClick={() => void selectChapterSpan(whole)}
      >
        Not right? Use the whole upload as one chapter instead
      </button>
    </div>
  );
}
