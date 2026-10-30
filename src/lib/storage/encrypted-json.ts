import { decryptSession, encryptSession } from '@/lib/util/crypto';

// AES-GCM-encrypted JSON values in chrome.storage.local (same scheme as the
// session + progress stores). Reads fail soft to the fallback; writes log.

const hasStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function readEncryptedJson<T>(key: string, fallback: T): Promise<T> {
  if (!hasStorage()) return fallback;
  try {
    const bag = await chrome.storage.local.get(key);
    const ciphertext = bag[key];
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) return fallback;
    return JSON.parse(await decryptSession(ciphertext)) as T;
  } catch (err) {
    console.error(`[Curio] Failed to read ${key}:`, err);
    return fallback;
  }
}

export async function writeEncryptedJson(key: string, value: unknown): Promise<void> {
  if (!hasStorage()) return;
  try {
    await chrome.storage.local.set({ [key]: await encryptSession(JSON.stringify(value)) });
  } catch (err) {
    console.error(`[Curio] Failed to write ${key}:`, err);
  }
}
