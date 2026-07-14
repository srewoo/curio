import type { ChapterProgress } from '@/types/progress';
import { encryptSession, decryptSession } from '@/lib/util/crypto';

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
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
  try {
    const bag = await chrome.storage.local.get(PROGRESS_KEY);
    const ciphertext = bag[PROGRESS_KEY];
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      if (ciphertext && typeof ciphertext === 'object') {
        return ciphertext as ProgressMap;
      }
      return {};
    }
    const plaintext = await decryptSession(ciphertext);
    return JSON.parse(plaintext) as ProgressMap;
  } catch (err) {
    console.error('[Curio] Failed to decrypt progress map:', err);
    return {};
  }
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
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const map = await readMap();
  const key = normalizeChapterKey(title);
  const prev = map[key];
  const attempts = [...(prev?.attempts ?? []), { at: nowIso, score }].slice(-MAX_ATTEMPTS);
  const mergedTopics = [...new Set([...weakTopics, ...(prev?.weakTopics ?? [])])].slice(0, MAX_WEAK_TOPICS);
  map[key] = { key, title, attempts, weakTopics: mergedTopics, updatedAt: nowIso };
  
  try {
    const plaintext = JSON.stringify(map);
    const ciphertext = await encryptSession(plaintext);
    await chrome.storage.local.set({ [PROGRESS_KEY]: ciphertext });
  } catch (err) {
    console.error('[Curio] Failed to encrypt progress map:', err);
  }
}

export async function clearAllProgress(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove(PROGRESS_KEY);
  }
}

export async function renameProgress(key: string, newTitle: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const map = await readMap();
    const record = map[key];
    if (record) {
      map[key] = {
        ...record,
        title: newTitle,
        updatedAt: new Date().toISOString(),
      };
      const plaintext = JSON.stringify(map);
      const ciphertext = await encryptSession(plaintext);
      await chrome.storage.local.set({ [PROGRESS_KEY]: ciphertext });
    }
  } catch (err) {
    console.error('[Curio] Failed to rename progress for key:', key, err);
  }
}

export async function deleteProgress(key: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const map = await readMap();
    if (map[key]) {
      delete map[key];
      const plaintext = JSON.stringify(map);
      const ciphertext = await encryptSession(plaintext);
      await chrome.storage.local.set({ [PROGRESS_KEY]: ciphertext });
    }
  } catch (err) {
    console.error('[Curio] Failed to delete progress for key:', key, err);
  }
}
