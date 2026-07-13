import type { ProviderId } from '@/config/providers';
import type { PageExtract, Chunk } from '@/types/session';
import { extensionCategory } from './validate';
import { docxToText, imageFileToPage, pdfToPageImages, txtToText, type PageImage } from './readers';
import { extractPage } from './vision-extract';
import { chunkPages } from '@/lib/index/chunk';
import { embedBatch, warmUpEmbedder } from '@/lib/index/embeddings';
import { VectorStore } from '@/lib/index/vector-store';

export type IngestPhase = 'preparing' | 'reading' | 'indexing';

export interface IngestProgress {
  readonly phase: IngestPhase;
  readonly done: number;
  readonly total: number;
}

export interface IndexResult {
  readonly store: VectorStore;
  readonly chunkCount: number;
}

interface Source {
  readonly name: string;
  readonly image?: PageImage;
  readonly text?: string; // for docx/txt (no vision call needed)
}

// Expand selected files into per-page sources (PDF → many, docx/txt → one).
async function expand(files: readonly File[]): Promise<Source[]> {
  const sources: Source[] = [];
  for (const file of files) {
    const cat = extensionCategory(file);
    if (cat === 'image') sources.push({ name: file.name, image: await imageFileToPage(file) });
    else if (cat === 'pdf') {
      const imgs = await pdfToPageImages(file);
      imgs.forEach((image, i) => sources.push({ name: `${file.name} p${i + 1}`, image }));
    } else if (cat === 'docx') sources.push({ name: file.name, text: await docxToText(file) });
    else sources.push({ name: file.name, text: await txtToText(file) });
  }
  return sources;
}

// Phase A: expand → per-page vision extract (+ moderation gate). Failures on one
// page never abort the rest (PRD §6.9). Stops short of chunking/embedding so a
// multi-chapter upload can be narrowed to one chapter's page range first
// (src/lib/ingest/chapters.ts) before any indexing cost is spent.
export async function extractPages(
  provider: ProviderId,
  visionModel: string,
  files: readonly File[],
  onProgress: (p: IngestProgress) => void,
): Promise<PageExtract[]> {
  const sources = await expand(files);
  const pages: PageExtract[] = [];

  for (let i = 0; i < sources.length; i++) {
    onProgress({ phase: 'reading', done: i, total: sources.length });
    const src = sources[i]!;
    if (src.text !== undefined) {
      const ok = src.text.length > 0;
      pages.push({ index: i + 1, sourceName: src.name, markdown: src.text, status: ok ? 'ok' : 'failed', reason: ok ? undefined : 'empty file' });
      continue;
    }
    const outcome = await extractPage(provider, visionModel, src.image!);
    pages.push({
      index: i + 1,
      sourceName: src.name,
      markdown: outcome.status === 'ok' ? outcome.markdown : '',
      status: outcome.status,
      reason: outcome.status === 'ok' ? undefined : outcome.reason,
    });
  }
  onProgress({ phase: 'reading', done: sources.length, total: sources.length });
  return pages;
}

// Phase B: chunk → local embed → in-memory vector store (PRD §6.3), restricted
// to `pageRange` when given (the chapter the student picked).
export async function buildIndex(
  pages: readonly PageExtract[],
  onProgress: (p: IngestProgress) => void,
  pageRange?: { readonly start: number; readonly end: number },
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
