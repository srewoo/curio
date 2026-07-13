import { z } from 'zod';
import { AGE_BANDS } from '@/config/providers';

// Settings are the ONLY persisted state (chrome.storage.local). Never content,
// never synced (PRD §6.6, §7.1). Runtime-validated with zod (CLAUDE.md §2).
export const settingsSchema = z.object({
  ageBand: z.number().refine((a) => (AGE_BANDS as readonly number[]).includes(a), {
    message: 'ageBand must be one of the supported bands',
  }),
  language: z.string().min(2),
  provider: z.enum(['openai', 'anthropic', 'gemini']),
  textModel: z.string().min(1),
  visionModel: z.string().min(1),
  // Salted hash of the settings-lock PIN, never the PIN itself (PRD §6.8).
  pinHash: z.string().optional(),
  sessionBudgetUsd: z.number().positive().optional(),
  // Adult consent to the chosen provider processing a child's content
  // (COPPA/GDPR-K, PRD §7.1a). Captured at setup / on provider change.
  consent: z
    .object({ provider: z.enum(['openai', 'anthropic', 'gemini']), acceptedAt: z.string() })
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
