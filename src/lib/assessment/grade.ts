import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { AssessmentAnswer, AssessmentQuestion, AssessmentResult, Chunk, GradedItem } from '@/types/session';
import { callBroker } from '@/lib/llm/client';
import { contextFromChunks } from '@/lib/rag/prompt';
import { extractJson } from '@/lib/util/json';
import { hasArithmeticError } from '@/lib/math/verify';

// Grade the assessment (PRD progress feature). MCQs are graded locally; short
// text answers are graded by the LLM against the rubric + chapter context, in a
// single batched call. Produces an overall score, a rating out of 10, and a
// short, encouraging summary.

const textGradeSchema = z.array(z.object({ score: z.number().min(0).max(1), feedback: z.string() }));

function answerFor(answers: readonly AssessmentAnswer[], id: string): AssessmentAnswer {
  return answers.find((a) => a.questionId === id) ?? { questionId: id, choiceIndex: null, text: '' };
}

function gradeMcq(q: AssessmentQuestion, a: AssessmentAnswer): GradedItem {
  const correct = a.choiceIndex === q.correctIndex;
  const right = q.choices[q.correctIndex] ?? '';
  return {
    question: q,
    answer: a,
    score: correct ? 1 : 0,
    feedback: correct ? 'Correct!' : `The answer is "${right}".`,
  };
}

async function gradeTextBatch(
  provider: ProviderId,
  model: string,
  context: string,
  items: { q: AssessmentQuestion; a: AssessmentAnswer }[],
): Promise<Map<string, { score: number; feedback: string }>> {
  const out = new Map<string, { score: number; feedback: string }>();
  if (items.length === 0) return out;

  const list = items
    .map((it, i) => `Q${i + 1}: ${it.q.question}\nGood answer includes: ${it.q.rubric}\nStudent: ${it.a.text || '(blank)'}`)
    .join('\n\n');
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system:
      'You grade a child\'s short answers against the chapter and each rubric. Be encouraging but fair. ' +
      'Return ONLY a JSON array (same order as the questions), each: {"score":0..1,"feedback":"one short sentence"}.',
    messages: [{ role: 'user', content: `${context}\n\n${list}` }],
    maxTokens: 500,
    temperature: 0.2,
  });

  const parsed = res.ok ? textGradeSchema.safeParse(extractJson(res.text)) : null;
  items.forEach((it, i) => {
    let g = parsed?.success ? parsed.data[i] : undefined;
    // Fallback if grading fails: neutral partial credit for a non-empty answer.
    g = g ?? { score: it.a.text.trim() ? 0.5 : 0, feedback: 'Answer recorded.' };
    // Safety net: the LLM grader could mark a wrong sum as correct. If the
    // student's own answer contains a checkable numeric equality that is
    // arithmetically wrong, cap the score rather than trust the LLM's grade.
    if (hasArithmeticError(it.a.text) && g.score > 0.3) {
      g = { score: 0.3, feedback: `${g.feedback} (Double-check your arithmetic — a calculation there doesn't add up.)` };
    }
    out.set(it.q.id, g);
  });
  return out;
}

function buildSummary(overall: number, items: readonly GradedItem[]): string {
  const strong = items.filter((i) => i.score >= 0.75).length;
  const weak = items.filter((i) => i.score < 0.5).length;
  if (overall >= 80) return `Great work — you clearly understand this chapter. You nailed ${strong} of ${items.length} questions.`;
  if (overall >= 50) return `Nice effort! You've got the main ideas. Review the ${weak} question(s) you missed and try again.`;
  return `Good start. This chapter needs a bit more review — go back over the parts you missed and take the quiz again.`;
}

export async function gradeAssessment(
  provider: ProviderId,
  model: string,
  questions: readonly AssessmentQuestion[],
  answers: readonly AssessmentAnswer[],
  chunks: readonly Chunk[],
): Promise<AssessmentResult> {
  const textItems = questions
    .filter((q) => q.kind === 'text')
    .map((q) => ({ q, a: answerFor(answers, q.id) }));
  const textGrades = await gradeTextBatch(provider, model, contextFromChunks(chunks), textItems);

  const items: GradedItem[] = questions.map((q) => {
    const a = answerFor(answers, q.id);
    if (q.kind === 'mcq') return gradeMcq(q, a);
    const g = textGrades.get(q.id) ?? { score: 0, feedback: 'Answer recorded.' };
    return { question: q, answer: a, score: g.score, feedback: g.feedback };
  });

  const overall = items.length === 0 ? 0 : Math.round((items.reduce((s, i) => s + i.score, 0) / items.length) * 100);
  return {
    items,
    overallScore: overall,
    ratingOutOf10: Math.round(overall / 10),
    summary: buildSummary(overall, items),
  };
}
