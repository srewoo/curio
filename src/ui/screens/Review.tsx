import { useEffect, useState } from 'react';
import { useCurio } from '@/state/store';
import type { ChapterMastery } from '@/types/mastery';
import { loadAllMastery, recordConceptResults } from '@/lib/mastery/store';
import { dueCards, type DueCard } from '@/lib/mastery/scheduler';
import { Brand } from '@/ui/components/Brand';
import { Rendered } from '@/ui/components/Rendered';

// Flashcard review. With a chapter scope: practise all of that chapter's
// cards. Without: everything due across chapters. Self-rating feeds the spaced
// review schedule — no LLM call, so reviews cost nothing.
function cardsFor(chapters: readonly ChapterMastery[], scope: string | null, now: Date): DueCard[] {
  if (scope === null) return dueCards(chapters, now);
  const ch = chapters.find((c) => c.key === scope);
  return ch ? ch.concepts.map((concept) => ({ chapterKey: ch.key, chapterTitle: ch.title, concept })) : [];
}

export function Review(): JSX.Element {
  const { reviewScope, endReview } = useCurio();
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [gotIt, setGotIt] = useState(0);

  useEffect(() => {
    void loadAllMastery().then((all) => setCards(cardsFor(all, reviewScope, new Date())));
  }, [reviewScope]);

  async function rate(score: number): Promise<void> {
    const card = cards?.[index];
    if (!card) return;
    await recordConceptResults(card.chapterKey, [{ conceptId: card.concept.id, score }], new Date());
    if (score >= 1) setGotIt((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  const title = reviewScope === null ? 'Review time' : 'Flashcards';
  if (cards === null) return <div className="text-sm text-ink-3">Loading cards…</div>;

  const card = cards[index];
  if (!card) {
    return (
      <div>
        <Brand title={title} icon="bulb" />
        <div className="curio-card p-6 text-center">
          <p className="text-lg font-medium mb-1">{cards.length === 0 ? 'Nothing due right now 🎉' : 'All done!'}</p>
          <p className="text-sm text-ink-2 mb-4">
            {cards.length === 0
              ? 'Curio will tell you when it is time to review again.'
              : `You knew ${gotIt} of ${cards.length}. Cards you missed will come back tomorrow.`}
          </p>
          <button className="curio-btn curio-btn-primary" onClick={() => void endReview()}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Brand title={title} tag={`Card ${index + 1} of ${cards.length} · ${card.chapterTitle}`} icon="bulb" />
      <button
        className="curio-card-flip block w-full text-left"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <div className={`curio-card-inner ${flipped ? 'flipped' : ''}`}>
          <div className="curio-card curio-card-face p-6 min-h-[180px] flex flex-col justify-center">
            <div className="text-[11px] text-ink-3 uppercase tracking-wide mb-2">{card.concept.name}</div>
            <div className="text-lg leading-relaxed"><Rendered text={card.concept.front} /></div>
            <div className="text-xs text-ink-3 mt-4">Think of your answer, then tap to check.</div>
          </div>
          <div className="curio-card curio-card-face curio-card-back p-6 flex flex-col justify-center bg-sage-tint overflow-y-auto">
            <div className="text-[11px] text-[#0F6E56] uppercase tracking-wide mb-2">Answer</div>
            <div className="text-base leading-relaxed"><Rendered text={card.concept.back} /></div>
          </div>
        </div>
      </button>

      <div className="flex justify-between items-center mt-5">
        <button className="curio-btn" onClick={() => void endReview()}>Stop</button>
        {flipped ? (
          <div className="flex gap-2">
            <button className="curio-btn" onClick={() => void rate(0)}>Not yet</button>
            <button className="curio-btn curio-btn-primary" onClick={() => void rate(1)}>I knew it</button>
          </div>
        ) : (
          <button className="curio-btn curio-btn-primary" onClick={() => setFlipped(true)}>Show answer</button>
        )}
      </div>
    </div>
  );
}
