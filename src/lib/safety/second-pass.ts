import { PROVIDERS, type ProviderId } from '@/config/providers';
import { SAFETY } from '@/config/constants';
import { SAFETY_REVIEW_SYSTEM } from './system-prompt';
import { callBroker } from '@/lib/llm/client';

// Second-pass safety review (PRD §6.7, TRD D6). Runs only at/below the age gate,
// against a small/fast model. Returns true if the draft is safe to show.
// Fails OPEN on infra error (don't block a legit answer on a transient failure)
// but fails CLOSED on an explicit UNSAFE verdict.

export function needsSecondPass(age: number): boolean {
  return age <= SAFETY.secondPassAgeGate;
}

export async function reviewIsSafe(provider: ProviderId, draft: string): Promise<boolean> {
  const model = PROVIDERS[provider].safetyModelId;
  const res = await callBroker({
    kind: 'chat',
    provider,
    model,
    system: SAFETY_REVIEW_SYSTEM,
    messages: [{ role: 'user', content: draft }],
    maxTokens: 4,
    temperature: 0,
  });
  if (!res.ok) return true; // fail open on infra error
  return !/unsafe/i.test(res.text);
}
