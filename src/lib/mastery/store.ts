import type { ChapterMastery, Concept, ConceptResult } from '@/types/mastery';
import { readEncryptedJson, writeEncryptedJson } from '@/lib/storage/encrypted-json';
import { applyResults, dueIndex } from './scheduler';
import { DUE_INDEX_KEY, refreshDueBadge } from './badge';

// Persistence for concept mastery. Encrypted like progress; also maintains the
// content-free due index the service worker uses for the toolbar badge.
const MASTERY_KEY = 'curio.mastery';
type MasteryMap = Record<string, ChapterMastery>;

const readMap = (): Promise<MasteryMap> => readEncryptedJson<MasteryMap>(MASTERY_KEY, {});

async function writeMap(map: MasteryMap): Promise<void> {
  await writeEncryptedJson(MASTERY_KEY, map);
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [DUE_INDEX_KEY]: dueIndex(Object.values(map)) });
  await refreshDueBadge().catch(() => undefined);
}

export async function loadAllMastery(): Promise<ChapterMastery[]> {
  return Object.values(await readMap());
}

export async function getMastery(key: string): Promise<ChapterMastery | null> {
  return (await readMap())[key] ?? null;
}

// Concepts are extracted once per chapter; re-ingesting the same chapter keeps
// existing concepts and history rather than resetting the child's progress.
export async function ensureConcepts(
  key: string,
  title: string,
  concepts: readonly Concept[],
  now: Date,
): Promise<ChapterMastery | null> {
  const map = await readMap();
  const existing = map[key];
  if (existing && existing.concepts.length > 0) return existing;
  if (concepts.length === 0) return null;
  map[key] = { key, title, concepts, states: {}, updatedAt: now.toISOString() };
  await writeMap(map);
  return map[key]!;
}

export async function recordConceptResults(
  key: string,
  results: readonly ConceptResult[],
  now: Date,
): Promise<ChapterMastery | null> {
  if (results.length === 0) return null;
  const map = await readMap();
  const chapter = map[key];
  if (!chapter) return null;
  map[key] = applyResults(chapter, results, now);
  await writeMap(map);
  return map[key]!;
}

export async function renameMastery(key: string, newTitle: string): Promise<void> {
  const map = await readMap();
  const chapter = map[key];
  if (!chapter) return;
  map[key] = { ...chapter, title: newTitle };
  await writeMap(map);
}

export async function deleteMastery(key: string): Promise<void> {
  const map = await readMap();
  if (!map[key]) return;
  delete map[key];
  await writeMap(map);
}

export async function clearAllMastery(): Promise<void> {
  await writeMap({});
}
