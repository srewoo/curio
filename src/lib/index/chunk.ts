import { CHUNKING } from '@/config/constants';
import type { PageExtract } from '@/types/session';

export interface RawChunk {
  readonly page: number;
  readonly text: string;
}

const targetChars = CHUNKING.targetTokens * CHUNKING.charsPerToken;
const overlapChars = CHUNKING.overlapTokens * CHUNKING.charsPerToken;

// Split a single page's markdown into ~500-token chunks with ~50-token overlap
// (PRD §6.3). We split on paragraph boundaries first, then pack greedily, so a
// chunk rarely cuts mid-sentence. No tokenizer dependency — a chars/token
// heuristic is enough for retrieval sizing.
function chunkText(page: number, text: string): RawChunk[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  if (clean.length <= targetChars) return [{ page, text: clean }];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: RawChunk[] = [];
  let buffer = '';

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push({ page, text: trimmed });
    // Carry an overlap tail into the next buffer for context continuity.
    buffer = trimmed.length > overlapChars ? trimmed.slice(trimmed.length - overlapChars) : trimmed;
  };

  for (const para of paragraphs) {
    if (buffer.length > 0 && buffer.length + para.length + 2 > targetChars) flush();
    buffer = buffer.length > 0 ? `${buffer}\n\n${para}` : para;
    // A single oversized paragraph is hard-split.
    while (buffer.length > targetChars) {
      chunks.push({ page, text: buffer.slice(0, targetChars) });
      buffer = buffer.slice(targetChars - overlapChars);
    }
  }
  if (buffer.trim()) chunks.push({ page, text: buffer.trim() });
  return chunks;
}

export function chunkPages(pages: readonly PageExtract[]): RawChunk[] {
  return pages
    .filter((p) => p.status === 'ok')
    .flatMap((p) => chunkText(p.index, p.markdown));
}
