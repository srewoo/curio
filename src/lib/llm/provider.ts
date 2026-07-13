import type { BrokerErrorCode, ChatRequest, LlmUsage, VisionRequest } from '@/types/messages';

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
}

export interface ProviderAdapter {
  chat(apiKey: string, req: ChatRequest): Promise<LlmResult>;
  vision(apiKey: string, req: VisionRequest): Promise<LlmResult>;
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
