import type { ProviderId } from '@/config/providers';
import type { PageImage } from './readers';
import { callBroker } from '@/lib/llm/client';
import { LOW_TEXT_YIELD_CHARS } from '@/config/constants';

// Vision-LLM extraction replaces OCR (PRD §6.2, TRD D2) and doubles as the
// inbound content-moderation gate (PRD §6.7). One call per page, no re-reads
// (cost, PRD §6.10).

const EXTRACT_SYSTEM =
  'You transcribe a single page of a school chapter for a child\'s tutor. ' +
  'Return rich Markdown: the verbatim text, plus [FIGURE: short description] for images/diagrams ' +
  'and [TABLE: ...] for tables. ' +
  'Transcribe ALL mathematical and scientific notation precisely as LaTeX: inline as $...$ and ' +
  'display equations as $$...$$. This includes equations, fractions, exponents, roots, integrals, ' +
  'matrices, units, and chemical formulas (use \\ce{...}, e.g. $\\ce{2H2 + O2 -> 2H2O}$). ' +
  'Preserve exercise/problem numbering exactly. Do not summarize, solve, or add facts. ' +
  'SAFETY GATE: if the page is not educational material, or contains adult, graphic, violent, or otherwise ' +
  'child-inappropriate content, reply with EXACTLY the token "REJECTED:" followed by a short reason, and nothing else.';

export type ExtractOutcome =
  | { readonly status: 'ok'; readonly markdown: string }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

export async function extractPage(
  provider: ProviderId,
  visionModel: string,
  image: PageImage,
): Promise<ExtractOutcome> {
  const res = await callBroker({
    kind: 'vision',
    provider,
    model: visionModel,
    system: EXTRACT_SYSTEM,
    prompt: 'Transcribe this page now.',
    image: { mimeType: image.mimeType, dataBase64: image.dataBase64 },
  });
  if (!res.ok) return { status: 'failed', reason: res.error.message };

  const text = res.text.trim();
  if (/^REJECTED:/i.test(text)) {
    return { status: 'rejected', reason: text.replace(/^REJECTED:\s*/i, '') || 'not educational content' };
  }
  // Low text yield → blurry/blank page (PRD §6.9); treat as failed so the user
  // is prompted to re-capture rather than indexing near-empty text.
  if (text.length < LOW_TEXT_YIELD_CHARS) {
    return { status: 'failed', reason: 'This page was hard to read — try a clearer photo.' };
  }
  return { status: 'ok', markdown: text };
}
