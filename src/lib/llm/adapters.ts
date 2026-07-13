import type { ProviderId } from '@/config/providers';
import type { ProviderAdapter } from './provider';
import { anthropicAdapter } from './anthropic-adapter';
import { openaiAdapter } from './openai-adapter';
import { geminiAdapter } from './gemini-adapter';

const ADAPTERS: Readonly<Record<ProviderId, ProviderAdapter>> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};

export function adapterFor(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}
