import {
  STREAM_PORT,
  type BrokerError,
  type BrokerRequest,
  type BrokerResponse,
  type ChatRequest,
  type LlmUsage,
  type StreamServerMessage,
} from '@/types/messages';

// Page-side client for the service-worker broker (TRD §3). All provider calls
// funnel through here so the page never holds the API key.

export async function callBroker(req: BrokerRequest): Promise<BrokerResponse> {
  try {
    return await chrome.runtime.sendMessage(req);
  } catch {
    return { ok: false, error: { code: 'network', message: 'Extension messaging failed.' } };
  }
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (usage: LlmUsage) => void;
  onError: (error: BrokerError) => void;
}

// Stream a grounded chat answer. Returns a cancel function.
export function streamChat(req: ChatRequest, handlers: StreamHandlers): () => void {
  const port = chrome.runtime.connect({ name: STREAM_PORT });
  port.onMessage.addListener((msg: StreamServerMessage) => {
    if (msg.type === 'delta') handlers.onDelta(msg.text);
    else if (msg.type === 'done') {
      handlers.onDone(msg.usage);
      port.disconnect();
    } else {
      handlers.onError(msg.error);
      port.disconnect();
    }
  });
  port.postMessage({ type: 'start', req });
  return () => port.disconnect();
}
