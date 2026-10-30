import { z } from 'zod';
import { AGE_BANDS } from '@/config/providers';

// Settings are the ONLY persisted state (chrome.storage.local). Never content,
// never synced (PRD §6.6, §7.1). Runtime-validated with zod (CLAUDE.md §2).
export const settingsSchema = z.object({
  ageBand: z.number().refine((a) => (AGE_BANDS as readonly number[]).includes(a), {
    message: 'ageBand must be one of the supported bands',
  }),
  language: z.string().min(2),
  provider: z.enum(['openai', 'anthropic', 'gemini', 'openrouter']),
  textModel: z.string().min(1),
  visionModel: z.string().min(1),
  // Salted hash of the settings-lock PIN, never the PIN itself (PRD §6.8).
  pinHash: z.string().optional(),
  sessionBudgetUsd: z.number().positive().optional(),
  // 'hints' = hint-first (guide, don't hand over homework answers);
  // 'explain' = full worked answers. Unset → hints for minors (effectiveTutorMode).
  tutorMode: z.enum(['hints', 'explain']).optional(),
  // Opt-in: Chrome's speech recognition sends audio to Google for transcription.
  voiceInput: z.boolean().optional(),
  // Opt-in: when a question isn't in the chapter, answer via the provider's
  // built-in web search (clearly labelled, sources shown). Off by default.
  webSearch: z.boolean().optional(),
  // Adult consent to the chosen provider processing a child's content
  // (COPPA/GDPR-K, PRD §7.1a). Captured at setup / on provider change.
  consent: z
    .object({ provider: z.enum(['openai', 'anthropic', 'gemini', 'openrouter']), acceptedAt: z.string() })
    .optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  ageBand: 10,
  language: 'en',
  provider: 'anthropic',
  textModel: 'claude-sonnet-5',
  visionModel: 'claude-sonnet-5',
};

// A minor per COPPA/GDPR-K posture (PRD §7.1a) — forces disclosures + 2nd pass.
export const isMinorAge = (age: number): boolean => age < 13;

export type TutorMode = 'hints' | 'explain';

export const effectiveTutorMode = (s: Pick<Settings, 'tutorMode' | 'ageBand'>): TutorMode =>
  s.tutorMode ?? (isMinorAge(s.ageBand) ? 'hints' : 'explain');
