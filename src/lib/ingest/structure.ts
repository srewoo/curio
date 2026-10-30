import type { ChapterSpan } from './chapters';

// Pure helpers that turn long inputs (books, web pages, transcripts) into
// tutor "pages" and chapter spans. Page numbers are 1-based throughout.

export const PAGE_CHARS = 2500;

// Pack paragraphs into ~maxChars pages; an oversized paragraph is hard-split.
export function paginateText(text: string, maxChars = PAGE_CHARS): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let buf = '';
  const flush = (): void => {
    if (buf) pages.push(buf);
    buf = '';
  };
  for (let para of paras) {
    while (para.length > maxChars) {
      flush();
      pages.push(para.slice(0, maxChars));
      para = para.slice(maxChars);
    }
    if (buf && buf.length + para.length + 2 > maxChars) flush();
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  flush();
  return pages;
}

export interface OutlineEntry {
  readonly title: string;
  readonly startPage: number;
}

// Front/back matter that isn't a chapter worth tutoring.
const NON_CHAPTER = /^(cover|title page|copyright|contents|table of contents|dedication|acknowledg|index|about the author)/i;

// Real chapter boundaries from a PDF outline / EPUB table of contents. Returns
// null when there aren't at least two usable chapters (caller falls back).
export function spansFromOutline(entries: readonly OutlineEntry[], lastPage: number): ChapterSpan[] | null {
  const starts = [...entries]
    .filter((e) => e.title.trim() && e.startPage >= 1 && e.startPage <= lastPage)
    .sort((a, b) => a.startPage - b.startPage)
    .filter((e, i, arr) => i === 0 || e.startPage !== arr[i - 1]!.startPage);
  const spans = starts.map((e, i) => ({
    title: e.title.trim().slice(0, 80),
    startPage: e.startPage,
    endPage: (starts[i + 1]?.startPage ?? lastPage + 1) - 1,
  }));
  const chapters = spans.filter((s) => !NON_CHAPTER.test(s.title));
  if (chapters.length < 2) return null;
  return chapters.map((s, i) => ({ id: `c${i}`, ...s }));
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface TimedText {
  readonly start: number; // seconds
  readonly end: number | null;
  readonly text: string;
}

// Group transcript segments into time-labelled pages, so a citation like
// [p. 3] opens a passage headed with its timestamps.
export function groupTranscript(segments: readonly TimedText[], segmentSec = 180): string[] {
  const pages: string[] = [];
  let bucket: TimedText[] = [];
  const flush = (): void => {
    if (bucket.length === 0) return;
    const start = bucket[0]!.start;
    const last = bucket[bucket.length - 1]!;
    const end = last.end ?? last.start;
    const body = bucket.map((b) => b.text.trim()).filter(Boolean).join(' ');
    if (body) pages.push(`[${formatClock(start)}–${formatClock(end)}]\n${body}`);
    bucket = [];
  };
  for (const seg of segments) {
    if (bucket.length > 0 && seg.start - bucket[0]!.start >= segmentSec) flush();
    bucket.push(seg);
  }
  flush();
  return pages;
}

// Resolve an href relative to a file inside an archive (EPUB), dropping any
// #fragment and normalising ./ and ../ segments.
export function resolveHref(fromFile: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0] ?? '');
  const baseDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/') + 1) : '';
  const parts = (clean.startsWith('/') ? clean.slice(1) : baseDir + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
