import type { ProviderId } from '@/config/providers';
import type { PageExtract, Chunk } from '@/types/session';
import { INGEST_LIMITS } from '@/config/constants';
import { extensionCategory, IngestLimitError } from './validate';
import { docxToText, imageFileToPage, readPdf, txtToText, type PageImage } from './readers';
import { readEpub } from './epub';
import { transcribeMedia } from './transcribe';
import { moderateText } from './moderate';
import { paginateText, type OutlineEntry } from './structure';
import { extractPage } from './vision-extract';
import { chunkPages } from '@/lib/index/chunk';
import { embedBatch, warmUpEmbedder } from '@/lib/index/embeddings';
import { VectorStore } from '@/lib/index/vector-store';

export type IngestPhase = 'opening' | 'transcribing' | 'reading' | 'preparing' | 'indexing';

export interface IngestProgress {
  readonly phase: IngestPhase;
  readonly done: number;
  readonly total: number;
}

export interface IndexResult {
  readonly store: VectorStore;
  readonly chunkCount: number;
}

// One tutor page. Text pages are ready; scanned pages render lazily and go
// through the vision extractor only if their chapter is picked.
export interface LazySource {
  readonly name: string;
  readonly text?: string;
  readonly image?: () => Promise<PageImage>;
  readonly untrusted?: boolean; // web pages + recordings: moderated before use
}

export interface OpenedUpload {
  readonly title: string;
  readonly sources: readonly LazySource[];
  readonly outline: readonly OutlineEntry[]; // chapter starts, 1-based pages
}

export interface PageRange {
  readonly start: number;
  readonly end: number;
}

const baseName = (name: string): string => name.replace(/\.[^.]+$/, '');

export function textSources(name: string, text: string, untrusted = false): LazySource[] {
  const pages = paginateText(text);
  return pages.map((t, i) => ({ name: pages.length > 1 ? `${name} part ${i + 1}` : name, text: t, untrusted }));
}

// Phase 0: open every file into pages, cheaply — no LLM calls. Books keep
// their table of contents so chapters can be picked before any extraction.
export async function openUpload(
  files: readonly File[],
  language: string,
  onProgress: (p: IngestProgress) => void,
): Promise<OpenedUpload> {
  const sources: LazySource[] = [];
  const outline: OutlineEntry[] = [];
  let title = files.length === 1 ? baseName(files[0]!.name) : 'Your chapter';

  for (const file of files) {
    const offset = sources.length;
    const cat = extensionCategory(file);
    if (cat === 'image') {
      sources.push({ name: file.name, image: () => imageFileToPage(file) });
    } else if (cat === 'pdf') {
      const pdf = await readPdf(file, INGEST_LIMITS.pdfTextMinChars, (done, total) => onProgress({ phase: 'opening', done, total }));
      pdf.pages.forEach((p, i) =>
        sources.push(p.text !== null ? { name: `${file.name} p${i + 1}`, text: p.text } : { name: `${file.name} p${i + 1}`, image: p.image }),
      );
      outline.push(...pdf.outline.map((o) => ({ title: o.title, startPage: o.startPage + offset })));
    } else if (cat === 'epub') {
      onProgress({ phase: 'opening', done: 0, total: 1 });
      const book = await readEpub(file);
      if (files.length === 1) title = book.title;
      book.pages.forEach((t, i) => sources.push({ name: `${book.title} §${i + 1}`, text: t }));
      outline.push(...book.outline.map((o) => ({ title: o.title, startPage: o.startPage + offset })));
    } else if (cat === 'media') {
      const pages = await transcribeMedia(file, language, (done, total) => onProgress({ phase: 'transcribing', done, total }));
      pages.forEach((t, i) => sources.push({ name: `${file.name} part ${i + 1}`, text: t, untrusted: true }));
    } else {
      sources.push(...textSources(file.name, cat === 'docx' ? await docxToText(file) : await txtToText(file)));
    }
    if (sources.length > INGEST_LIMITS.maxPages) {
      throw new IngestLimitError(`That's over ${INGEST_LIMITS.maxPages} pages — try uploading one part of the book.`);
    }
  }
  return { title, sources, outline };
}

const allPages = (n: number): PageRange => ({ start: 1, end: n });

// Phase A: turn the chosen page range into page text — vision extract for
// scanned pages (+ its moderation gate), one moderation call for untrusted
// text. Failures on one page never abort the rest (PRD §6.9).
export async function extractSources(
  provider: ProviderId,
  visionModel: string,
  sources: readonly LazySource[],
  onProgress: (p: IngestProgress) => void,
  range: PageRange = allPages(sources.length),
): Promise<PageExtract[]> {
  const indices: number[] = [];
  for (let i = Math.max(1, range.start); i <= Math.min(sources.length, range.end); i++) indices.push(i);

  const scans = indices.filter((i) => !sources[i - 1]!.text && sources[i - 1]!.image).length;
  if (scans > INGEST_LIMITS.maxVisionPages) {
    throw new IngestLimitError(
      `That part has ${scans} scanned pages — Curio reads up to ${INGEST_LIMITS.maxVisionPages} photos at a time. Pick a smaller chapter or upload fewer pages.`,
    );
  }

  const sample = indices.flatMap((i) => (sources[i - 1]!.untrusted ? [sources[i - 1]!.text ?? ''] : [])).join('\n\n');
  const verdict = sample ? await moderateText(provider, visionModel, sample) : null;

  const pages: PageExtract[] = [];
  for (const [n, index] of indices.entries()) {
    onProgress({ phase: 'reading', done: n, total: indices.length });
    const src = sources[index - 1]!;
    if (src.text !== undefined) {
      const rejected = src.untrusted && verdict && !verdict.ok;
      const ok = src.text.length > 0 && !rejected;
      pages.push({
        index,
        sourceName: src.name,
        markdown: ok ? src.text : '',
        status: rejected ? 'rejected' : ok ? 'ok' : 'failed',
        reason: rejected && verdict && !verdict.ok ? verdict.reason : ok ? undefined : 'empty page',
      });
      continue;
    }
    let outcome: Awaited<ReturnType<typeof extractPage>>;
    try {
      outcome = await extractPage(provider, visionModel, await src.image!());
    } catch {
      outcome = { status: 'failed', reason: "Couldn't render this page." };
    }
    pages.push({
      index,
      sourceName: src.name,
      markdown: outcome.status === 'ok' ? outcome.markdown : '',
      status: outcome.status,
      reason: outcome.status === 'ok' ? undefined : outcome.reason,
    });
  }
  onProgress({ phase: 'reading', done: indices.length, total: indices.length });
  return pages;
}

// Phase B: chunk → local embed → in-memory vector store (PRD §6.3), restricted
// to `pageRange` when given (the chapter the student picked).
export async function buildIndex(
  pages: readonly PageExtract[],
  onProgress: (p: IngestProgress) => void,
  pageRange?: PageRange,
): Promise<IndexResult> {
  onProgress({ phase: 'preparing', done: 0, total: 1 });
  await warmUpEmbedder(); // first-run weights fetch (TRD D3)

  const selected = pageRange ? pages.filter((p) => p.index >= pageRange.start && p.index <= pageRange.end) : pages;
  const raw = chunkPages(selected);
  const store = new VectorStore();
  if (raw.length > 0) {
    onProgress({ phase: 'indexing', done: 0, total: raw.length });
    const embeddings = await embedBatch(raw.map((r) => r.text));
    const chunks: Chunk[] = raw.map((r, i) => ({
      id: `c${i}`,
      page: r.page,
      text: r.text,
      embedding: embeddings[i]!,
    }));
    store.add(chunks);
    onProgress({ phase: 'indexing', done: raw.length, total: raw.length });
  }

  return { store, chunkCount: raw.length };
}
