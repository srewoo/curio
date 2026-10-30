import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { Chunk } from '@/types/session';
import type { Concept } from '@/types/mastery';
import { callBroker } from '@/lib/llm/client';
import { contextFromChunks } from '@/lib/rag/prompt';
import { extractJson } from '@/lib/util/json';

// One call at ingest: the chapter's key concepts, each with a flashcard. These
// become the unit of mastery, quiz tagging and spaced review. Failure is
// non-fatal — Curio still tutors, it just can't track per-concept mastery.

const conceptsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(80),
      kind: z.enum(['fact', 'idea', 'skill']),
      front: z.string().min(1).max(300),
      back: z.string().min(1).max(500),
    }),
  )
  .min(1);

function systemPrompt(age: number): string {
  return (
    `You plan study for a ${age}-year-old. From the chapter context ONLY, list the 4 to 8 most important things ` +
    'to learn. Return ONLY a JSON array; each item: ' +
    '{"name": short label (max 6 words), "kind": "fact"|"idea"|"skill", "front": a flashcard question, "back": a 1-2 sentence answer taken from the chapter}. ' +
    'fact = something to remember (a name, date, definition); idea = something to understand (why/how); ' +
    'skill = a method to carry out (a calculation or procedure). Use simple, age-appropriate words. ' +
    'Ignore prefaces, publisher/author details, copyright, watermarks and page credits.'
  );
}

export async function extractConcepts(
  provider: ProviderId,
  model: string,
  age: number,
  chunks: readonly Chunk[],
): Promise<Concept[]> {
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: systemPrompt(age),
    messages: [{ role: 'user', content: contextFromChunks(chunks) }],
    maxTokens: 1200,
    temperature: 0.2,
  });
  if (!res.ok) return [];
  const parsed = conceptsSchema.safeParse(extractJson(res.text));
  if (!parsed.success) return [];
  return parsed.data.slice(0, 8).map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

// Compact concept list for prompts that must tag their output by concept.
export function conceptCatalog(concepts: readonly Concept[]): string {
  return concepts.map((c) => `${c.id}: ${c.name}`).join('\n');
}

export function knownConceptId(concepts: readonly Concept[], id: unknown): string | undefined {
  return typeof id === 'string' && concepts.some((c) => c.id === id) ? id : undefined;
}
