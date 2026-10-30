import type { PageExtract } from '@/types/session';
import type { ChapterSpan } from '@/lib/ingest/chapters';
import { normalizeChapterKey } from '@/lib/progress/store';
import { readEncryptedJson, writeEncryptedJson } from '@/lib/storage/encrypted-json';

// Multi-chapter books: the readable page text + chapter spans are kept
// (encrypted) so the child can open any other chapter later without
// re-uploading. Scanned pages that were never extracted aren't stored, so a
// chapter made only of those needs the file again (see chapterAvailable).

export interface SavedBook {
  readonly key: string;
  readonly title: string;
  readonly spans: readonly ChapterSpan[];
  readonly pages: readonly PageExtract[]; // status 'ok' pages only
  readonly savedAt: string;
}

export interface BookInfo {
  readonly key: string;
  readonly title: string;
  readonly chapters: number;
}

const INDEX_KEY = 'curio.books';
const bookKey = (key: string): string => `curio.book.${key}`;
const MAX_BOOKS = 10;

async function readIndex(): Promise<BookInfo[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  const bag = await chrome.storage.local.get(INDEX_KEY);
  return Array.isArray(bag[INDEX_KEY]) ? (bag[INDEX_KEY] as BookInfo[]) : [];
}

export const listBooks = readIndex;

export function chapterAvailable(book: Pick<SavedBook, 'pages'>, span: ChapterSpan): boolean {
  const have = new Set(book.pages.map((p) => p.index));
  for (let i = span.startPage; i <= span.endPage; i++) if (!have.has(i)) return false;
  return true;
}

// Merge newly extracted pages into the saved book (or create it).
export async function saveBook(title: string, spans: readonly ChapterSpan[], pages: readonly PageExtract[]): Promise<string> {
  const key = normalizeChapterKey(title);
  const prev = await loadBook(key);
  const merged = new Map((prev?.pages ?? []).map((p) => [p.index, p]));
  for (const p of pages) if (p.status === 'ok') merged.set(p.index, p);
  const book: SavedBook = {
    key,
    title,
    spans,
    pages: [...merged.values()].sort((a, b) => a.index - b.index),
    savedAt: new Date().toISOString(),
  };
  await writeEncryptedJson(bookKey(key), book);

  let index = (await readIndex()).filter((b) => b.key !== key);
  index.unshift({ key, title, chapters: spans.length });
  for (const old of index.slice(MAX_BOOKS)) await chrome.storage.local.remove(bookKey(old.key));
  index = index.slice(0, MAX_BOOKS);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [INDEX_KEY]: index });
  return key;
}

export function loadBook(key: string): Promise<SavedBook | null> {
  return readEncryptedJson<SavedBook | null>(bookKey(key), null);
}

export async function deleteBook(key: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove(bookKey(key));
  await chrome.storage.local.set({ [INDEX_KEY]: (await readIndex()).filter((b) => b.key !== key) });
}
