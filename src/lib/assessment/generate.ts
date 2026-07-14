import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { AssessmentQuestion, Chunk } from '@/types/session';
import { callBroker } from '@/lib/llm/client';
import { contextFromChunks } from '@/lib/rag/prompt';
import { extractJson } from '@/lib/util/json';

// Generate the final assessment from a broad sample of the chapter (PRD progress
// feature). MCQs + short-answer text questions, grounded only in context.

export interface AssessmentSpec {
  readonly mcq: number;
  readonly text: number;
}

export const DEFAULT_SPEC: AssessmentSpec = { mcq: 3, text: 2 };

const rawSchema = z.array(
  z.object({
    kind: z.enum(['mcq', 'text']),
    question: z.string().min(1),
    choices: z.array(z.string()).default([]),
    correctIndex: z.number().int().default(-1),
    rubric: z.string().default(''),
  }),
);

function systemPrompt(spec: AssessmentSpec, age: number): string {
  return (
    `You write a short end-of-chapter quiz for a ${age}-year-old, grounded ONLY in the chapter context. ` +
    `Create exactly ${spec.mcq} multiple-choice questions (4 options each, one correct) and ` +
    `${spec.text} short open-answer questions that need 1–3 sentences. ` +
    'Return ONLY a JSON array; each item: ' +
    '{"kind":"mcq"|"text","question":string,"choices":string[],"correctIndex":number,"rubric":string}. ' +
    'For mcq: 4 choices and correctIndex 0–3, rubric "". ' +
    'For text: choices [], correctIndex -1, and rubric = what a good answer must mention. ' +
    'Cover different parts of the chapter. Keep language simple and age-appropriate. ' +
    'CRITICAL RULE: Focus exclusively on academic concepts, subject matter, and lessons of the chapter. ' +
    'Never generate questions about preface text, publishing details, copyright, book credits, page counts, ' +
    'who published the book, what is printed on watermarks/special paper, or author/publisher metadata.'
  );
}

export async function generateAssessment(
  provider: ProviderId,
  model: string,
  age: number,
  chunks: readonly Chunk[],
  spec: AssessmentSpec = DEFAULT_SPEC,
  focusTopics: readonly string[] = [],
): Promise<AssessmentQuestion[]> {
  // Retention loop: weight the quiz toward topics the student struggled with.
  const focus =
    focusTopics.length > 0
      ? `\n\nThe student previously found these areas hard — include at least one question on them:\n- ${focusTopics.slice(0, 6).join('\n- ')}`
      : '';
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: systemPrompt(spec, age),
    messages: [{ role: 'user', content: `${contextFromChunks(chunks)}${focus}\n\nWrite the quiz now.` }],
    maxTokens: 1200,
    temperature: 0.4,
  });
  if (!res.ok) return [];
  const parsed = rawSchema.safeParse(extractJson(res.text));
  if (!parsed.success) return [];

  return parsed.data
    .filter((q) => (q.kind === 'mcq' ? q.choices.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.choices.length : true))
    .map((q, i) => ({
      id: `q${i}`,
      kind: q.kind,
      question: q.question,
      choices: q.kind === 'mcq' ? q.choices.slice(0, 4) : [],
      correctIndex: q.kind === 'mcq' ? q.correctIndex : -1,
      rubric: q.kind === 'text' ? q.rubric : '',
    }));
}
