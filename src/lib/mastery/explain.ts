import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { RetrievedChunk } from '@/types/session';
import type { Concept } from '@/types/mastery';
import { callBroker } from '@/lib/llm/client';
import { buildContextBlock } from '@/lib/rag/prompt';
import { extractJson } from '@/lib/util/json';

// "Explain it back" (Feynman check): the child explains a concept in their own
// words; Curio grades it against the chapter and says what was missing.

const gradeSchema = z.object({ score: z.number().min(0).max(1), feedback: z.string().min(1) });

export function explainPrompt(concept: Concept): string {
  return `Your turn to be the teacher! Can you explain **${concept.name}** in your own words, like you're telling a friend? There's no wrong way to start.`;
}

export interface ExplainGrade {
  readonly score: number;
  readonly feedback: string;
}

export async function gradeExplanation(
  provider: ProviderId,
  model: string,
  age: number,
  concept: Concept,
  retrieved: readonly RetrievedChunk[],
  explanation: string,
): Promise<ExplainGrade | null> {
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system:
      `You check a ${age}-year-old's own-words explanation of one concept against the chapter context only. ` +
      'Be warm and specific: say what they got right, then the ONE most important thing missing or mixed up, ' +
      'using the chapter. Score 1 = complete and correct, 0.5 = partly there, 0 = off track or blank. ' +
      'Return ONLY JSON: {"score": 0..1, "feedback": "2-3 short sentences addressed to the student"}.',
    messages: [
      {
        role: 'user',
        content:
          `${buildContextBlock(retrieved)}\n\nConcept: ${concept.name}\nReference answer: ${concept.back}\n\n` +
          `Student's explanation: ${explanation}`,
      },
    ],
    maxTokens: 300,
    temperature: 0.2,
  });
  if (!res.ok) return null;
  const parsed = gradeSchema.safeParse(extractJson(res.text));
  return parsed.success ? parsed.data : null;
}
