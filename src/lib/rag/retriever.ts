import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { ChapterSummary, RetrievedChunk } from '@/types/session';
import type { VectorStore } from '@/lib/index/vector-store';
import { embed } from '@/lib/index/embeddings';
import { callBroker } from '@/lib/llm/client';
import { buildContextBlock, buildSummaryPrompt, FOLLOWUP_INSTRUCTION } from './prompt';
import { extractJson } from '@/lib/util/json';
import { RETRIEVAL } from '@/config/constants';

// Retrieval + auxiliary generations (summary, follow-ups). The main answer is
// streamed by the Chat screen; these helpers are one-shot.

export interface Retrieval {
  readonly chunks: RetrievedChunk[];
  readonly grounded: boolean; // max score ≥ threshold (PRD §6.4/§6.7)
}

export async function retrieve(store: VectorStore, query: string): Promise<Retrieval> {
  const q = await embed(query);
  const chunks = store.search(q, RETRIEVAL.topK);
  const top = chunks[0]?.score ?? 0;
  return { chunks, grounded: top >= RETRIEVAL.groundednessThreshold };
}

const summarySchema = z.object({ overview: z.string(), starters: z.array(z.string()).min(1) });

export async function generateSummary(
  provider: ProviderId,
  model: string,
  title: string,
  retrieved: readonly RetrievedChunk[],
): Promise<ChapterSummary> {
  const fallback: ChapterSummary = {
    title,
    overview: "Let's explore your chapter together. Ask me anything about it!",
    starters: ['What is this chapter about?', 'Explain the main idea simply.', 'Give me an example from it.'],
  };
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: 'You introduce a chapter to a child, grounded only in the provided context.',
    messages: [{ role: 'user', content: `${buildContextBlock(retrieved)}\n\n${buildSummaryPrompt()}` }],
    maxTokens: 400,
    temperature: 0.4,
  });
  if (!res.ok) return fallback;
  const parsed = summarySchema.safeParse(extractJson(res.text));
  if (!parsed.success) return fallback;
  return { title, overview: parsed.data.overview, starters: parsed.data.starters.slice(0, 3) };
}

export async function generateFollowUps(
  provider: ProviderId,
  model: string,
  retrieved: readonly RetrievedChunk[],
  lastAnswer: string,
): Promise<string[]> {
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: 'You suggest follow-up questions grounded only in the chapter context.',
    messages: [
      { role: 'user', content: `${buildContextBlock(retrieved)}\n\nYour last answer: ${lastAnswer}\n\n${FOLLOWUP_INSTRUCTION}` },
    ],
    maxTokens: 200,
    temperature: 0.6,
  });
  if (!res.ok) return [];
  const parsed = extractJson<string[]>(res.text);
  return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, 3) : [];
}
