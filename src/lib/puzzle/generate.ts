import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { Puzzle, RetrievedChunk } from '@/types/session';
import { callBroker } from '@/lib/llm/client';
import { buildContextBlock } from '@/lib/rag/prompt';
import { extractJson } from '@/lib/util/json';
import type { Concept } from '@/types/mastery';
import { conceptCatalog, knownConceptId } from '@/lib/mastery/extract';

// Quick-check puzzle generated from retrieved context (PRD §6.5).
const puzzleSchema = z.object({
  kind: z.enum(['mcq', 'fill-blank', 'true-false']),
  question: z.string().min(1),
  choices: z.array(z.string()).max(4),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1),
  concept: z.string().optional(),
});

const PUZZLE_SYSTEM =
  'You write ONE quick comprehension check for a child, grounded ONLY in the chapter context. ' +
  'Return ONLY JSON: {"kind":"mcq"|"fill-blank"|"true-false","question":string,' +
  '"choices":string[],"correctIndex":number,"explanation":string}. ' +
  'For mcq give 4 choices; for true-false give ["True","False"]; for fill-blank give []. ' +
  'Keep it simple and age-appropriate. The explanation is one sentence. ' +
  'CRITICAL RULE: Focus exclusively on academic concepts/lessons of the chapter, ignoring any prefatory text, ' +
  'publisher/author metadata, copyright, who published the book, watermarks, page credits, or prefaces.';

export async function generatePuzzle(
  provider: ProviderId,
  model: string,
  age: number,
  retrieved: readonly RetrievedChunk[],
  focusTopics: readonly string[] = [],
  concepts: readonly Concept[] = [],
): Promise<Puzzle | null> {
  const focus =
    focusTopics.length > 0 ? ` If it fits the context, check one of these tricky areas: ${focusTopics.slice(0, 3).join('; ')}.` : '';
  const tagging =
    concepts.length > 0 ? `\nChapter concepts (id: name):\n${conceptCatalog(concepts)}\nAdd "concept": the id this check tests.` : '';
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: PUZZLE_SYSTEM,
    messages: [
      { role: 'user', content: `${buildContextBlock(retrieved)}\n\nStudent age: ${age}. Write the check now.${focus}${tagging}` },
    ],
    maxTokens: 400,
    temperature: 0.5,
  });
  if (!res.ok) return null;
  const parsed = puzzleSchema.safeParse(extractJson(res.text));
  if (!parsed.success) return null;
  const { concept, ...p } = parsed.data;
  if (p.correctIndex >= Math.max(p.choices.length, 1)) return null;
  return { ...p, conceptId: knownConceptId(concepts, concept) };
}
