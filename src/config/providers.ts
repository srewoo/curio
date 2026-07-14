// Provider catalog (PRD §6.6). Each provider exposes text + vision models.
// Host permissions in manifest.json must stay in sync with `apiBase` hosts.
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

export interface ModelOption {
  readonly id: string;
  readonly label: string;
  // Approximate USD per 1M tokens, used for the pre-ingest cost estimate
  // (PRD §6.10). These are coarse and must be treated as ±50% (TRD §11).
  readonly inputPerMTokUsd: number;
  readonly outputPerMTokUsd: number;
}

export interface ProviderSpec {
  readonly id: ProviderId;
  readonly label: string;
  readonly apiBase: string;
  readonly textModels: readonly ModelOption[];
  readonly visionModels: readonly ModelOption[];
  // A small/fast model for the second-pass safety check (TRD D6).
  readonly safetyModelId: string;
  readonly getKeyUrl: string;
  // Disclosures for the minors-consent gate (PRD §7.1a, TRD O2).
  readonly tosUrl: string;
  readonly privacyUrl: string;
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderSpec>> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    apiBase: 'https://api.anthropic.com',
    textModels: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', inputPerMTokUsd: 15, outputPerMTokUsd: 75 },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', inputPerMTokUsd: 0.8, outputPerMTokUsd: 4 },
    ],
    visionModels: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', inputPerMTokUsd: 15, outputPerMTokUsd: 75 },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
    ],
    safetyModelId: 'claude-haiku-4-5-20251001',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    tosUrl: 'https://www.anthropic.com/legal/consumer-terms',
    privacyUrl: 'https://www.anthropic.com/legal/privacy',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiBase: 'https://api.openai.com',
    textModels: [
      { id: 'gpt-4.1', label: 'GPT-4.1', inputPerMTokUsd: 2, outputPerMTokUsd: 8 },
      { id: 'gpt-4o', label: 'GPT-4o', inputPerMTokUsd: 2.5, outputPerMTokUsd: 10 },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6 },
    ],
    visionModels: [
      { id: 'gpt-4.1', label: 'GPT-4.1', inputPerMTokUsd: 2, outputPerMTokUsd: 8 },
      { id: 'gpt-4o', label: 'GPT-4o', inputPerMTokUsd: 2.5, outputPerMTokUsd: 10 },
    ],
    safetyModelId: 'gpt-4o-mini',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    tosUrl: 'https://openai.com/policies/terms-of-use',
    privacyUrl: 'https://openai.com/policies/privacy-policy',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    apiBase: 'https://generativelanguage.googleapis.com',
    textModels: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPerMTokUsd: 1.25, outputPerMTokUsd: 10 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.4 },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', inputPerMTokUsd: 1.25, outputPerMTokUsd: 5 },
    ],
    visionModels: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPerMTokUsd: 1.25, outputPerMTokUsd: 10 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.4 },
    ],
    safetyModelId: 'gemini-2.0-flash',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    tosUrl: 'https://ai.google.dev/gemini-api/terms',
    privacyUrl: 'https://policies.google.com/privacy',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    apiBase: 'https://openrouter.ai/api',
    textModels: [
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', inputPerMTokUsd: 3.0, outputPerMTokUsd: 15.0 },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenRouter)', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.60 },
      { id: 'openai/gpt-4o', label: 'GPT-4o (OpenRouter)', inputPerMTokUsd: 2.50, outputPerMTokUsd: 10.00 },
      { id: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash (OpenRouter)', inputPerMTokUsd: 0.10, outputPerMTokUsd: 0.40 },
    ],
    visionModels: [
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', inputPerMTokUsd: 3.0, outputPerMTokUsd: 15.0 },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenRouter)', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.60 },
      { id: 'openai/gpt-4o', label: 'GPT-4o (OpenRouter)', inputPerMTokUsd: 2.50, outputPerMTokUsd: 10.00 },
      { id: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash (OpenRouter)', inputPerMTokUsd: 0.10, outputPerMTokUsd: 0.40 },
    ],
    safetyModelId: 'openai/gpt-4o-mini',
    getKeyUrl: 'https://openrouter.ai/keys',
    tosUrl: 'https://openrouter.ai/terms',
    privacyUrl: 'https://openrouter.ai/privacy',
  },
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
] as const;

export const AGE_BANDS = [6, 8, 10, 12, 14, 16, 18] as const;

export function findModel(provider: ProviderId, modelId: string): ModelOption | undefined {
  const spec = PROVIDERS[provider];
  return [...spec.textModels, ...spec.visionModels].find((m) => m.id === modelId);
}

// Non-technical users pick ONE "AI model" that both answers questions and reads
// photos. The vision-capable models are also strong text models, so we surface
// that set as the single unified choice (used for both text and vision).
export function unifiedModels(provider: ProviderId): readonly ModelOption[] {
  return PROVIDERS[provider].visionModels;
}

export function defaultUnifiedModelId(provider: ProviderId): string {
  return PROVIDERS[provider].visionModels[0]!.id;
}

// Coerce a possibly text-only saved model to a valid unified (dual-capable) one.
export function coerceUnifiedModelId(provider: ProviderId, modelId: string): string {
  const list = unifiedModels(provider);
  return list.some((m) => m.id === modelId) ? modelId : defaultUnifiedModelId(provider);
}
