import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '@/types/settings';
import type { PageExtract } from '@/types/session';
import type { VectorStore } from '@/lib/index/vector-store';
import { buildIndex, extractSources, openUpload, textSources, type IngestProgress, type OpenedUpload } from '@/lib/ingest/pipeline';
import { detectChapters, type ChapterSpan } from '@/lib/ingest/chapters';
import { spansFromOutline } from '@/lib/ingest/structure';
import { IngestLimitError } from '@/lib/ingest/validate';
import { capturePage, getCapturableTab, type CapturableTab } from '@/lib/ingest/web-capture';
import { chapterAvailable, loadBook, saveBook, type SavedBook } from '@/lib/books/store';
import { getEmbeddingMode } from '@/lib/index/embeddings';

// Everything from "files/page chosen" to "chapter indexed": open → (pick a
// chapter) → extract → index. Books keep their chapters for later.

export interface ReadyChapter {
  readonly title: string;
  readonly store: VectorStore;
  readonly bookKey?: string;
}

export interface ChapterChoices {
  readonly spans: readonly ChapterSpan[];
  readonly unavailable: ReadonlySet<string>; // span ids whose pages need the file again
  readonly bookTitle?: string;
  readonly allowWhole: boolean;
}

type Pending =
  | { readonly kind: 'upload'; readonly opened: OpenedUpload; readonly spans: ChapterSpan[]; readonly extracted: PageExtract[] | null }
  | { readonly kind: 'book'; readonly book: SavedBook };

interface Deps {
  readonly settings: Settings;
  readonly goTo: (screen: 'ingesting' | 'chapters' | 'upload') => void;
  readonly setBanner: (b: string | null) => void;
  readonly onReady: (chapter: ReadyChapter) => Promise<void>;
}

const UNREADABLE = "I couldn't read any of those pages. Try clearer photos or a different file.";

function describeFailures(failed: readonly PageExtract[]): string {
  const rejected = failed.filter((p) => p.status === 'rejected');
  if (rejected.length > 0) return `${rejected.length} page(s) were skipped as not suitable for a tutor.`;
  return `Couldn't read ${failed.length} page(s) clearly — re-upload clearer photos if you like.`;
}

// Text pages of an opened upload, ready to save with a book without any calls.
function readyTextPages(opened: OpenedUpload): PageExtract[] {
  return opened.sources.flatMap((s, i) =>
    s.text && !s.untrusted ? [{ index: i + 1, sourceName: s.name, markdown: s.text, status: 'ok' as const }] : [],
  );
}

export function useIngest({ settings, goTo, setBanner, onReady }: Deps) {
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [choices, setChoices] = useState<ChapterChoices | null>(null);
  const [capturable, setCapturable] = useState<CapturableTab | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    void getCapturableTab().then(setCapturable);
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      setBanner(err instanceof IngestLimitError ? err.message : 'Something went wrong while reading your chapter. Please try again.');
      goTo('upload');
    },
    [goTo, setBanner],
  );

  const finalize = useCallback(
    async (pages: readonly PageExtract[], span: ChapterSpan, title: string, bookKey?: string) => {
      const range = { start: span.startPage, end: span.endPage };
      const result = await buildIndex(pages, setProgress, range);
      const failed = pages.filter((p) => p.index >= range.start && p.index <= range.end && p.status !== 'ok');
      const notes: string[] = [];
      if (failed.length > 0) notes.push(describeFailures(failed));
      if (getEmbeddingMode() === 'fallback') notes.push('Running in basic reading mode on this device — answers stay grounded in your chapter.');
      setNote(notes.length > 0 ? notes.join(' ') : null);
      if (result.chunkCount === 0) {
        setBanner(failed.some((p) => p.status === 'rejected') ? 'That content was skipped as not suitable for a tutor.' : UNREADABLE);
        goTo('upload');
        return;
      }
      pendingRef.current = null;
      setChoices(null);
      await onReady({ title, store: result.store, bookKey });
    },
    [goTo, onReady, setBanner],
  );

  const showChoices = useCallback(
    (pending: Pending, next: ChapterChoices) => {
      pendingRef.current = pending;
      setChoices(next);
      goTo('chapters');
    },
    [goTo],
  );

  const startIngest = useCallback(
    async (files: File[]) => {
      goTo('ingesting');
      setProgress(null);
      setBanner(null);
      try {
        const opened = await openUpload(files, settings.language, setProgress);
        if (opened.sources.length === 0) throw new IngestLimitError(UNREADABLE);
        // A real table of contents: pick the chapter first, read only that.
        const outlined = spansFromOutline(opened.outline, opened.sources.length);
        if (outlined) {
          showChoices({ kind: 'upload', opened, spans: outlined, extracted: null }, { spans: outlined, unavailable: new Set(), bookTitle: opened.title, allowWhole: false });
          return;
        }
        const pages = await extractSources(settings.provider, settings.visionModel, opened.sources, setProgress);
        if (!pages.some((p) => p.status === 'ok')) {
          setBanner(pages.some((p) => p.status === 'rejected') ? 'That content was skipped as not suitable for a tutor.' : UNREADABLE);
          goTo('upload');
          return;
        }
        const spans = await detectChapters(settings.provider, settings.textModel, pages);
        if (spans.length <= 1) {
          const whole = { id: 'c0', title: opened.title, startPage: 1, endPage: opened.sources.length };
          await finalize(pages, whole, opened.title);
          return;
        }
        showChoices({ kind: 'upload', opened, spans, extracted: pages }, { spans, unavailable: new Set(), bookTitle: opened.title, allowWhole: true });
      } catch (err) {
        fail(err);
      }
    },
    [settings.language, settings.provider, settings.visionModel, settings.textModel, goTo, setBanner, finalize, showChoices, fail],
  );

  const startCapture = useCallback(async () => {
    goTo('ingesting');
    setProgress(null);
    setBanner(null);
    try {
      const res = await capturePage();
      if (!res.ok) throw new IngestLimitError(res.error);
      const sources = textSources(res.title, res.text, true);
      const pages = await extractSources(settings.provider, settings.textModel, sources, setProgress);
      await finalize(pages, { id: 'c0', title: res.title, startPage: 1, endPage: sources.length }, res.title.slice(0, 80));
    } catch (err) {
      fail(err);
    }
  }, [settings.provider, settings.textModel, goTo, setBanner, finalize, fail]);

  const selectChapterSpan = useCallback(
    async (span: ChapterSpan, whole = false) => {
      const pending = pendingRef.current;
      if (!pending) return;
      goTo('ingesting');
      setProgress(null);
      try {
        if (pending.kind === 'book') {
          if (!chapterAvailable(pending.book, span)) throw new IngestLimitError('That chapter has scanned pages Curio hasn’t read yet — upload the book again to open it.');
          await finalize(pending.book.pages, span, `${span.title} · ${pending.book.title}`, pending.book.key);
          return;
        }
        const { opened, spans } = pending;
        const range = { start: span.startPage, end: span.endPage };
        const pages = pending.extracted ?? (await extractSources(settings.provider, settings.visionModel, opened.sources, setProgress, range));
        if (whole) {
          await finalize(pages, span, opened.title);
          return;
        }
        const bookKey = await saveBook(opened.title, spans, [...readyTextPages(opened), ...pages]);
        await finalize(pages, span, `${span.title} · ${opened.title}`, bookKey);
      } catch (err) {
        fail(err);
      }
    },
    [settings.provider, settings.visionModel, goTo, finalize, fail],
  );

  const openBookChapters = useCallback(
    async (bookKey: string) => {
      const book = await loadBook(bookKey);
      if (!book) {
        setBanner("That book isn't saved any more — upload it again.");
        return;
      }
      const unavailable = new Set(book.spans.filter((s) => !chapterAvailable(book, s)).map((s) => s.id));
      showChoices({ kind: 'book', book }, { spans: book.spans, unavailable, bookTitle: book.title, allowWhole: false });
    },
    [setBanner, showChoices],
  );

  const resetIngest = useCallback(() => {
    pendingRef.current = null;
    setChoices(null);
    setNote(null);
  }, []);

  return { progress, note, choices, capturable, startIngest, startCapture, selectChapterSpan, openBookChapters, resetIngest };
}
