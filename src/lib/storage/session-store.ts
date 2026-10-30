import { VectorStore } from '@/lib/index/vector-store';
import type { ChapterSummary, ChatTurn, Chunk } from '@/types/session';
import { encryptSession, decryptSession } from '@/lib/util/crypto';

const CURRENT_SESSION_KEY = 'curio.currentSessionKey';
const SAVED_SESSIONS_LIST_KEY = 'curio.savedSessionsList';
// unlimitedStorage lifts the 10 MB quota; 20 keeps the library manageable.
const MAX_SESSIONS = 20;

export interface SavedSessionInfo {
  readonly key: string;
  readonly updatedAt: string;
  readonly title?: string; // absent on entries saved by older versions
  readonly bookKey?: string; // set when the chapter came from a saved book
}

export interface SerializedSession {
  readonly title: string;
  readonly summary: ChapterSummary;
  readonly history: readonly ChatTurn[];
  readonly turnCount: number;
  readonly spentUsd: number;
  readonly bookKey?: string;
  readonly chunks: readonly {
    readonly id: string;
    readonly text: string;
    readonly page: number;
    readonly embedding: readonly number[];
  }[];
}

export interface RestoredSession {
  readonly key: string;
  readonly title: string;
  readonly store: VectorStore;
  readonly summary: ChapterSummary;
  readonly history: readonly ChatTurn[];
  readonly turnCount: number;
  readonly spentUsd: number;
  readonly bookKey?: string;
}

function normalizeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || 'chapter';
}

function sessionKeyFor(chapterKey: string): string {
  return `curio.session.${chapterKey}`;
}

export async function listSavedSessions(): Promise<SavedSessionInfo[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  return getSavedSessionsList();
}

async function getSavedSessionsList(): Promise<SavedSessionInfo[]> {
  const data = await chrome.storage.local.get(SAVED_SESSIONS_LIST_KEY);
  const list = data[SAVED_SESSIONS_LIST_KEY];
  return Array.isArray(list) ? (list as SavedSessionInfo[]) : [];
}

async function saveSavedSessionsList(list: SavedSessionInfo[]): Promise<void> {
  await chrome.storage.local.set({ [SAVED_SESSIONS_LIST_KEY]: list });
}

export async function saveActiveSession(
  title: string,
  summary: ChapterSummary,
  history: readonly ChatTurn[],
  turnCount: number,
  spentUsd: number,
  store: VectorStore,
  bookKey?: string,
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

  const chapterKey = normalizeKey(title);
  const chunks = store.sample(store.size);
  const session: SerializedSession = {
    title,
    summary,
    history,
    turnCount,
    spentUsd,
    bookKey,
    chunks: chunks.map((c) => ({
      id: c.id,
      text: c.text,
      page: c.page,
      embedding: Array.from(c.embedding),
    })),
  };

  try {
    const plaintext = JSON.stringify(session);
    const ciphertext = await encryptSession(plaintext);
    const sessionKey = sessionKeyFor(chapterKey);

    await chrome.storage.local.set({
      [CURRENT_SESSION_KEY]: chapterKey,
      [sessionKey]: ciphertext,
    });

    let list = await getSavedSessionsList();
    list = list.filter((s) => s.key !== chapterKey);
    list.unshift({ key: chapterKey, updatedAt: new Date().toISOString(), title, bookKey });

    if (list.length > MAX_SESSIONS) {
      const toRemove = list.slice(MAX_SESSIONS);
      for (const item of toRemove) {
        await chrome.storage.local.remove(sessionKeyFor(item.key));
      }
      list = list.slice(0, MAX_SESSIONS);
    }
    await saveSavedSessionsList(list);
  } catch (err) {
    console.error('[Curio] Failed to save session:', err);
  }
}

export async function loadActiveSession(): Promise<RestoredSession | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;

  try {
    const pointer = await chrome.storage.local.get(CURRENT_SESSION_KEY);
    const activeKey = pointer[CURRENT_SESSION_KEY];
    if (typeof activeKey !== 'string' || activeKey.length === 0) return null;

    return await loadSessionByKey(activeKey);
  } catch (err) {
    console.error('[Curio] Failed to restore active session:', err);
    return null;
  }
}

export async function loadSessionByKey(chapterKey: string): Promise<RestoredSession | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;

  try {
    const sessionKey = sessionKeyFor(chapterKey);
    const data = await chrome.storage.local.get(sessionKey);
    const ciphertext = data[sessionKey];
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) return null;

    const plaintext = await decryptSession(ciphertext);
    const session = JSON.parse(plaintext) as SerializedSession;

    const store = new VectorStore();
    const chunks: Chunk[] = session.chunks.map((c) => ({
      id: c.id,
      text: c.text,
      page: c.page,
      embedding: new Float32Array(c.embedding),
    }));
    store.add(chunks);

    await chrome.storage.local.set({ [CURRENT_SESSION_KEY]: chapterKey });

    return {
      key: chapterKey,
      title: session.title,
      store,
      summary: session.summary,
      history: session.history,
      turnCount: session.turnCount,
      spentUsd: session.spentUsd,
      bookKey: session.bookKey,
    };
  } catch (err) {
    console.error('[Curio] Failed to load session for key:', chapterKey, err);
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const pointer = await chrome.storage.local.get(CURRENT_SESSION_KEY);
    const activeKey = pointer[CURRENT_SESSION_KEY];
    if (typeof activeKey === 'string' && activeKey.length > 0) {
      await deleteSessionByKey(activeKey);
    }
    await chrome.storage.local.remove(CURRENT_SESSION_KEY);
  } catch (err) {
    console.error('[Curio] Failed to clear active session:', err);
  }
}

export async function deleteSessionByKey(chapterKey: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.remove(sessionKeyFor(chapterKey));
    
    let list = await getSavedSessionsList();
    list = list.filter((s) => s.key !== chapterKey);
    await saveSavedSessionsList(list);

    const pointer = await chrome.storage.local.get(CURRENT_SESSION_KEY);
    if (pointer[CURRENT_SESSION_KEY] === chapterKey) {
      await chrome.storage.local.remove(CURRENT_SESSION_KEY);
    }
  } catch (err) {
    console.error('[Curio] Failed to delete session for key:', chapterKey, err);
  }
}

export async function renameSessionByKey(chapterKey: string, newTitle: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const sessionKey = sessionKeyFor(chapterKey);
    const data = await chrome.storage.local.get(sessionKey);
    const ciphertext = data[sessionKey];
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) return;

    const plaintext = await decryptSession(ciphertext);
    const session = JSON.parse(plaintext) as SerializedSession;

    const updatedSession: SerializedSession = {
      ...session,
      title: newTitle,
    };

    const newPlaintext = JSON.stringify(updatedSession);
    const newCiphertext = await encryptSession(newPlaintext);
    await chrome.storage.local.set({ [sessionKey]: newCiphertext });
    const list = await getSavedSessionsList();
    await saveSavedSessionsList(list.map((s) => (s.key === chapterKey ? { ...s, title: newTitle } : s)));
  } catch (err) {
    console.error('[Curio] Failed to rename session for key:', chapterKey, err);
  }
}
