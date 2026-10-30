// "Import this tab": when the toolbar icon is clicked, Chrome grants activeTab
// for the tab the child was on. The service worker remembers that tab; the
// popup asks it to read the page's main text via chrome.scripting. No host
// permissions, no fetching — only the page the child chose, while it's open.

export const CAPTURE_TAB_KEY = 'curio.captureTab';

export interface CapturableTab {
  readonly tabId: number;
  readonly title: string;
  readonly url: string;
}

export interface CaptureRequest {
  readonly kind: 'capturePage';
}

export type CaptureResponse =
  | { readonly ok: true; readonly title: string; readonly url: string; readonly text: string }
  | { readonly ok: false; readonly error: string };

export const isCapturableUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

export async function getCapturableTab(): Promise<CapturableTab | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return null;
  const bag = await chrome.storage.session.get(CAPTURE_TAB_KEY);
  const tab = bag[CAPTURE_TAB_KEY] as CapturableTab | undefined;
  return tab && isCapturableUrl(tab.url) ? tab : null;
}

export async function capturePage(): Promise<CaptureResponse> {
  try {
    return (await chrome.runtime.sendMessage({ kind: 'capturePage' } satisfies CaptureRequest)) as CaptureResponse;
  } catch {
    return { ok: false, error: 'Extension messaging failed.' };
  }
}
