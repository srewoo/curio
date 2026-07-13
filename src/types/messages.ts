import type { ProviderId } from '@/config/providers';

// Contract between the popup page and the service-worker broker (TRD §3, §8).
// The broker reads the API key from chrome.storage.local itself; the key is
// NEVER included in a message, so it never enters page-visible state (§10).

export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LlmImage {
  readonly mimeType: string;
  readonly dataBase64: string; // base64 WITHOUT the data: URL prefix
}

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type BrokerErrorCode =
  | 'invalid_key'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'blocked'
  | 'no_key'
  | 'unknown';

export interface BrokerError {
  readonly code: BrokerErrorCode;
  readonly message: string;
}

export interface ChatRequest {
  readonly kind: 'chat';
  readonly provider: ProviderId;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface VisionRequest {
  readonly kind: 'vision';
  readonly provider: ProviderId;
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  readonly image: LlmImage;
  readonly maxTokens?: number;
}

export interface ValidateKeyRequest {
  readonly kind: 'validateKey';
  readonly provider: ProviderId;
  readonly model: string;
}

export type BrokerRequest = ChatRequest | VisionRequest | ValidateKeyRequest;

export type BrokerResponse =
  | { readonly ok: true; readonly text: string; readonly usage: LlmUsage }
  | { readonly ok: false; readonly error: BrokerError };

// Streaming chat is delivered over a long-lived Port named `STREAM_PORT`.
export const STREAM_PORT = 'curio-llm-stream';

export type StreamClientMessage = { readonly type: 'start'; readonly req: ChatRequest };

export type StreamServerMessage =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'done'; readonly usage: LlmUsage }
  | { readonly type: 'error'; readonly error: BrokerError };
