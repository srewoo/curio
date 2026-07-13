import { settingsSchema, DEFAULT_SETTINGS, type Settings } from '@/types/settings';

// The only persisted state (PRD §6.6, §7.1). Settings live under one key; the
// API key lives under a SEPARATE key and is read only by the service worker.
const SETTINGS_KEY = 'curio.settings';
const API_KEY_KEY = 'curio.apiKey';

async function readRaw(key: string): Promise<unknown> {
  const bag = await chrome.storage.local.get(key);
  return bag[key];
}

export async function loadSettings(): Promise<Settings> {
  const raw = await readRaw(SETTINGS_KEY);
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  // Validate before persisting so we never write a malformed shape.
  const valid = settingsSchema.parse(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: valid });
}

export async function getApiKey(): Promise<string | null> {
  const raw = await readRaw(API_KEY_KEY);
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_KEY]: key });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_KEY);
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
