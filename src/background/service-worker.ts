import { getApiKey } from '@/lib/storage/settings-store';
import { adapterFor } from '@/lib/llm/adapters';
import { AdapterError } from '@/lib/llm/provider';
import { withRetry } from '@/lib/llm/retry';
import { DUE_ALARM, refreshDueBadge } from '@/lib/mastery/badge';
import { CAPTURE_TAB_KEY, getCapturableTab, isCapturableUrl, type CaptureRequest, type CaptureResponse } from '@/lib/ingest/web-capture';
import { readableText } from '@/lib/ingest/readable-text';
import {
  STREAM_PORT,
  type BrokerError,
  type BrokerRequest,
  type BrokerResponse,
  type StreamClientMessage,
  type StreamServerMessage,
} from '@/types/messages';

// MV3 service worker = STATELESS request broker (TRD §3). It holds no chapter
// state; it only attaches the API key, applies retry/backoff, and returns
// results. Closing the popup destroys all session state elsewhere.

function toBrokerError(err: unknown): BrokerError {
  if (err instanceof AdapterError) return { code: err.code, message: err.message };
  return { code: 'unknown', message: 'Something went wrong.' };
}

// PRD §6.1: clicking the icon opens a large dedicated window (not the tab).
chrome.action.onClicked.addListener((tab) => {
  // Clicking the icon grants activeTab for this tab: remember it so the child
  // can choose "Import this page" (src/lib/ingest/web-capture.ts).
  if (tab.id !== undefined && isCapturableUrl(tab.url)) {
    void chrome.storage.session.set({ [CAPTURE_TAB_KEY]: { tabId: tab.id, title: tab.title ?? tab.url, url: tab.url } });
  } else {
    void chrome.storage.session.remove(CAPTURE_TAB_KEY);
  }
  void chrome.windows.create({
    url: chrome.runtime.getURL('index.html'),
    type: 'popup',
    state: 'maximized',
  });
});

async function handle(req: BrokerRequest): Promise<BrokerResponse> {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: { code: 'no_key', message: 'No API key set.' } };
  const adapter = adapterFor(req.provider);
  try {
    if (req.kind === 'validateKey') {
      await withRetry(() => adapter.validateKey(apiKey, req.model));
      return { ok: true, text: '', usage: { inputTokens: 0, outputTokens: 0 } };
    }
    const result =
      req.kind === 'vision'
        ? await withRetry(() => adapter.vision(apiKey, req))
        : req.kind === 'webSearch'
          ? await withRetry(() => adapter.webSearch(apiKey, req))
          : await withRetry(() => adapter.chat(apiKey, req));
    return { ok: true, text: result.text, usage: result.usage, sources: result.sources, searchEntryHtml: result.searchEntryHtml };
  } catch (err) {
    return { ok: false, error: toBrokerError(err) };
  }
}

async function captureTab(): Promise<CaptureResponse> {
  const tab = await getCapturableTab();
  if (!tab) return { ok: false, error: 'Open Curio from the web page you want to import.' };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.tabId }, func: readableText });
    const text = typeof res?.result === 'string' ? res.result : '';
    if (text.length < 200) return { ok: false, error: "That page doesn't have enough readable text." };
    return { ok: true, title: tab.title, url: tab.url, text };
  } catch {
    return { ok: false, error: "Chrome didn't allow reading that page — it may have changed. Click the Curio icon while on the page, then import." };
  }
}

// One-shot request/response for vision, validateKey, follow-ups, puzzles, etc.
chrome.runtime.onMessage.addListener((msg: BrokerRequest | CaptureRequest, _sender, sendResponse) => {
  (msg.kind === 'capturePage' ? captureTab() : handle(msg)).then(sendResponse);
  return true; // keep the message channel open for the async response
});

// Streaming chat over a long-lived Port: provider tokens are forwarded as they
// arrive. Retries are allowed only until the first token has been sent.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== STREAM_PORT) return;
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
  });
  const send = (m: StreamServerMessage): void => {
    if (open) port.postMessage(m);
  };
  port.onMessage.addListener((msg: StreamClientMessage) => {
    if (msg.type !== 'start') return;
    void (async () => {
      const apiKey = await getApiKey();
      if (!apiKey) return send({ type: 'error', error: { code: 'no_key', message: 'No API key set.' } });
      const adapter = adapterFor(msg.req.provider);
      let sent = false;
      try {
        const result = await withRetry(
          () =>
            adapter.chatStream(apiKey, msg.req, (text) => {
              sent = true;
              send({ type: 'delta', text });
            }),
          () => !sent,
        );
        send({ type: 'done', usage: result.usage });
      } catch (err) {
        send({ type: 'error', error: toBrokerError(err) });
      }
    })();
  });
});

// Due-review badge: re-count hourly and on browser start.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(DUE_ALARM, { periodInMinutes: 60 });
  void refreshDueBadge();
});
chrome.runtime.onStartup.addListener(() => void refreshDueBadge());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === DUE_ALARM) void refreshDueBadge();
});
