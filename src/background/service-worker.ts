import { getApiKey } from '@/lib/storage/settings-store';
import { adapterFor } from '@/lib/llm/adapters';
import { AdapterError } from '@/lib/llm/provider';
import { withRetry } from '@/lib/llm/retry';
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
chrome.action.onClicked.addListener(() => {
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
        : await withRetry(() => adapter.chat(apiKey, req));
    return { ok: true, text: result.text, usage: result.usage };
  } catch (err) {
    return { ok: false, error: toBrokerError(err) };
  }
}

// One-shot request/response for vision, validateKey, follow-ups, puzzles, etc.
chrome.runtime.onMessage.addListener((msg: BrokerRequest, _sender, sendResponse) => {
  handle(msg).then(sendResponse);
  return true; // keep the message channel open for the async response
});

// Streaming chat over a long-lived Port. Native token streaming is a follow-up
// (TRD §17); today the broker emits the full answer as a single delta so the UI
// stream contract is stable and swappable.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== STREAM_PORT) return;
  port.onMessage.addListener((msg: StreamClientMessage) => {
    if (msg.type !== 'start') return;
    void (async () => {
      const res = await handle(msg.req);
      const out: StreamServerMessage = res.ok
        ? ((): StreamServerMessage => {
            port.postMessage({ type: 'delta', text: res.text } satisfies StreamServerMessage);
            return { type: 'done', usage: res.usage };
          })()
        : { type: 'error', error: res.error };
      port.postMessage(out);
    })();
  });
});
