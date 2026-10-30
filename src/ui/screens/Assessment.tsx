import { useMemo, useState } from 'react';
import type { AssessmentAnswer } from '@/types/session';
import { useCurio } from '@/state/store';
import { Brand } from '@/ui/components/Brand';
import { Rendered } from '@/ui/components/Rendered';

// Final quiz (PRD progress feature): answer all questions, then submit for a
// graded overall score. MCQs use choices; text questions use a short textarea.
export function Assessment(): JSX.Element {
  const { assessmentQuestions, assessmentBusy, submitAssessment, backToChat, assessmentKind } = useCurio();
  const placement = assessmentKind === 'placement';
  const title = placement ? 'What do you already know?' : 'Quick test';
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  const questions = assessmentQuestions ?? [];
  const allAnswered = useMemo(
    () => questions.every((q) => (q.kind === 'mcq' ? choices[q.id] !== undefined : (texts[q.id] ?? '').trim().length > 0)),
    [questions, choices, texts],
  );

  function submit(): void {
    const answers: AssessmentAnswer[] = questions.map((q) => ({
      questionId: q.id,
      choiceIndex: q.kind === 'mcq' ? choices[q.id] ?? null : null,
      text: q.kind === 'text' ? texts[q.id] ?? '' : '',
    }));
    void submitAssessment(answers);
  }

  if (assessmentBusy && questions.length === 0) {
    return (
      <div>
        <Brand title={title} tag={placement ? 'Building a quick check…' : 'Building your quiz…'} icon="bulb" />
        <p className="text-sm text-ink-2">Curio is writing a few questions from your chapter…</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div>
        <Brand title={title} icon="bulb" />
        <p className="text-sm text-ink-2 mb-4">Couldn't build a quiz right now. Let's keep chatting instead.</p>
        <button className="curio-btn" onClick={backToChat}>Back to chat</button>
      </div>
    );
  }

  return (
    <div>
      <Brand
        title={title}
        tag={placement ? `${questions.length} questions · no score — it's fine to pick "not sure"` : `${questions.length} questions`}
        icon="bulb"
      />
      <p className="text-sm text-ink-2 mb-5">Answer these to see how well you've understood the chapter.</p>

      <div className="flex flex-col gap-4">
        {questions.map((q, qi) => (
          <div key={q.id} className="curio-card p-5">
            <p className="text-[15px] font-medium mb-3">
              <span className="text-ink-3 mr-1.5">{qi + 1}.</span>
              <Rendered text={q.question} />
            </p>
            {q.kind === 'mcq' ? (
              <div className="flex flex-col gap-2">
                {q.choices.map((choice, ci) => (
                  <button
                    key={ci}
                    onClick={() => setChoices((c) => ({ ...c, [q.id]: ci }))}
                    className={`text-left px-3.5 py-3 rounded-lg border text-sm flex items-center gap-2.5 ${
                      choices[q.id] === ci ? 'bg-sage-tint border-sage-line' : 'bg-paper border-line'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-md bg-card border border-line-2 flex items-center justify-center text-[11px] text-ink-3">
                      {String.fromCharCode(65 + ci)}
                    </span>
                    <Rendered text={choice} />
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                className="curio-input w-full min-h-[72px] resize-y"
                placeholder="Type your answer in a sentence or two…"
                value={texts[q.id] ?? ''}
                onChange={(e) => setTexts((t) => ({ ...t, [q.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-6">
        <button className="curio-btn" onClick={backToChat} disabled={assessmentBusy}>Cancel</button>
        <button className="curio-btn curio-btn-primary" onClick={submit} disabled={!allAnswered || assessmentBusy}>
          {assessmentBusy ? 'Grading…' : placement ? 'Done' : 'See my score'}
        </button>
      </div>
    </div>
  );
}
