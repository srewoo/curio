import { z } from 'zod';
import type { ProviderId } from '@/config/providers';
import type { PageExtract } from '@/types/session';
import { callBroker } from '@/lib/llm/client';
import { extractJson } from '@/lib/util/json';

// Detect chapter/section boundaries across the uploaded pages (one cheap text
// call, not per-page) so a multi-chapter upload can be narrowed to one chapter
// before indexing — rather than blending unrelated chapters into one tutor.

export interface ChapterSpan {
  readonly id: string;
  readonly title: string;
  readonly startPage: number;
  readonly endPage: number;
}

const spanSchema = z.object({
  title: z.string().min(1),
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
});
const responseSchema = z.array(spanSchema);

const SYSTEM =
  'You look at the first lines of each page of a scanned school book upload and decide whether it contains ' +
  'ONE chapter/section or SEVERAL. Return ONLY a JSON array, ordered by page, covering every page exactly once: ' +
  '[{"title": string, "startPage": number, "endPage": number}, ...]. ' +
  'If it is all one chapter, return a single item covering all pages with a short title for it. ' +
  'Only split when you see clear new-chapter/unit signals (e.g. "Chapter 5", "Unit 3: ...", a new topic heading ' +
  'after earlier pages clearly wrapped up). Do not split on sub-headings within the same chapter. Titles ≤ 8 words.';

function snippetFor(page: PageExtract): string {
  const firstLine = page.markdown.split('\n').find((l) => l.trim().length > 0) ?? '';
  return `Page ${page.index}: ${firstLine.slice(0, 140)}`;
}

function fallbackSpan(pages: readonly PageExtract[]): ChapterSpan[] {
  const indices = pages.map((p) => p.index);
  return [{ id: 'c0', title: 'Your chapter', startPage: Math.min(...indices), endPage: Math.max(...indices) }];
}

function sanitizeSpans(raw: z.infer<typeof responseSchema>, pages: readonly PageExtract[]): ChapterSpan[] {
  const min = Math.min(...pages.map((p) => p.index));
  const max = Math.max(...pages.map((p) => p.index));
  const cleaned = raw
    .map((s) => ({ ...s, startPage: Math.max(min, s.startPage), endPage: Math.min(max, s.endPage) }))
    .filter((s) => s.startPage <= s.endPage)
    .sort((a, b) => a.startPage - b.startPage);
  if (cleaned.length === 0) return fallbackSpan(pages);
  return cleaned.map((s, i) => ({ id: `c${i}`, title: s.title, startPage: s.startPage, endPage: s.endPage }));
}

// Only worth asking about when there's more than one readable page — a single
// page can never contain a chapter boundary.
export async function detectChapters(
  provider: ProviderId,
  model: string,
  pages: readonly PageExtract[],
): Promise<ChapterSpan[]> {
  const readable = pages.filter((p) => p.status === 'ok');
  if (readable.length < 2) return fallbackSpan(pages.length > 0 ? pages : readable);

  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: SYSTEM,
    messages: [{ role: 'user', content: readable.map(snippetFor).join('\n') }],
    maxTokens: 400,
    temperature: 0,
  });
  if (!res.ok) return fallbackSpan(readable);

  const parsed = responseSchema.safeParse(extractJson(res.text));
  if (!parsed.success) return fallbackSpan(readable);
  return sanitizeSpans(parsed.data, readable);
}
