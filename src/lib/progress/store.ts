import type { ChapterProgress } from '@/types/progress';

// Persistence for the retention loop (PRD progress feature). Separate storage
// key from settings; content-free by construction.
const PROGRESS_KEY = 'curio.progress';
const MAX_ATTEMPTS = 10;
const MAX_WEAK_TOPICS = 8;

type ProgressMap = Record<string, ChapterProgress>;

export function normalizeChapterKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || 'chapter';
}

// A short, human-readable label for a missed question (for "review these" chips
// and to bias future question generation).
export function topicLabel(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
  return clean.length > 70 ? `${clean.slice(0, 67)}…` : clean;
}

async function readMap(): Promise<ProgressMap> {
  const bag = await chrome.storage.local.get(PROGRESS_KEY);
  const raw = bag[PROGRESS_KEY];
  return raw && typeof raw === 'object' ? (raw as ProgressMap) : {};
}

export async function loadAllProgress(): Promise<ChapterProgress[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProgress(title: string): Promise<ChapterProgress | null> {
  const map = await readMap();
  return map[normalizeChapterKey(title)] ?? null;
}

// Merge a new attempt: append the score, union weak topics (most recent kept).
export async function recordAttempt(
  title: string,
  score: number,
  weakTopics: readonly string[],
  nowIso: string,
): Promise<void> {
  const map = await readMap();
  const key = normalizeChapterKey(title);
  const prev = map[key];
  const attempts = [...(prev?.attempts ?? []), { at: nowIso, score }].slice(-MAX_ATTEMPTS);
  const mergedTopics = [...new Set([...weakTopics, ...(prev?.weakTopics ?? [])])].slice(0, MAX_WEAK_TOPICS);
  map[key] = { key, title, attempts, weakTopics: mergedTopics, updatedAt: nowIso };
  await chrome.storage.local.set({ [PROGRESS_KEY]: map });
}
