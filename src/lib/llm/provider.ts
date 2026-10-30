import type { BrokerErrorCode, ChatRequest, LlmUsage, VisionRequest, WebSearchRequest, WebSource } from '@/types/messages';

// Provider abstraction (TRD D7). One adapter per provider isolates request/
// response shape, auth header, and model catalog. Adding a provider = one file.

export class AdapterError extends Error {
  readonly code: BrokerErrorCode;
  constructor(code: BrokerErrorCode, message: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}

export interface LlmResult {
  readonly text: string;
  readonly usage: LlmUsage;
  readonly sources?: readonly WebSource[];
  // Gemini grounding: Google's required "Search Suggestions" HTML.
  readonly searchEntryHtml?: string;
}

export type DeltaHandler = (text: string) => void;

export interface ProviderAdapter {
  chat(apiKey: string, req: ChatRequest): Promise<LlmResult>;
  // Token streaming; resolves with the full text + usage once the stream ends.
  chatStream(apiKey: string, req: ChatRequest, onDelta: DeltaHandler): Promise<LlmResult>;
  vision(apiKey: string, req: VisionRequest): Promise<LlmResult>;
  // One web-grounded answer using the provider's built-in search tool.
  webSearch(apiKey: string, req: WebSearchRequest): Promise<LlmResult>;
  // Cheap, no-content request to confirm the key works (PRD §6.8).
  validateKey(apiKey: string, model: string): Promise<void>;
}

// Map an HTTP status to a normalized broker error code (PRD §6.9).
export function statusToCode(status: number): BrokerErrorCode {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

// POST and fail with a normalized AdapterError on network/HTTP failure.
export async function postOk(url: string, init: RequestInit, label: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', ...init });
  } catch {
    throw new AdapterError('network', `Could not reach ${label}.`);
  }
  if (!res.ok) throw new AdapterError(statusToCode(res.status), `${label} error ${res.status}.`);
  return res;
}
