// Prompt-injection containment (PRD §6.7, TRD D8). Uploaded chapter text is
// UNTRUSTED. Before a retrieved chunk enters the prompt we neutralize
// instruction-like patterns so page content can never change the tutor's role,
// rules, or safety policy. Retrieved chunks are additionally delimited and
// labeled as reference material (see buildGroundedPrompt).

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts|rules)/gi,
  /disregard (?:the |all )?(?:previous|above|system) [a-z ]*/gi,
  /you are now\b/gi,
  /forget (?:everything|all|the above)/gi,
  /new (?:instructions|system prompt|rules)\s*:/gi,
  /system prompt\s*:/gi,
  /\bact as\b/gi,
  /pretend (?:to be|you are)/gi,
  /developer mode/gi,
];

// Neutralize by defanging the trigger phrase, not deleting content — we keep
// the educational text intact but strip its imperative power.
export function neutralizeInjections(text: string): string {
  let out = text;
  for (const pattern of INJECTION_PATTERNS) {
    out = out.replace(pattern, (m) => `[removed instruction: ${m.slice(0, 24)}…]`);
  }
  return out;
}

export function sanitizeChunk(text: string): string {
  return neutralizeInjections(text).trim();
}
