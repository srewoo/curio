import { countDue } from './scheduler';

// Toolbar badge for due reviews. The popup writes a content-free list of due
// timestamps; the service worker re-counts it hourly via chrome.alarms.
export const DUE_INDEX_KEY = 'curio.dueIndex';
export const DUE_ALARM = 'curio-due-check';

export async function refreshDueBadge(now = new Date()): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.action) return;
  const bag = await chrome.storage.local.get(DUE_INDEX_KEY);
  const index = Array.isArray(bag[DUE_INDEX_KEY]) ? (bag[DUE_INDEX_KEY] as string[]) : [];
  const n = countDue(index, now);
  await chrome.action.setBadgeBackgroundColor({ color: '#0F6E56' });
  await chrome.action.setBadgeText({ text: n > 0 ? String(Math.min(n, 99)) : '' });
}
