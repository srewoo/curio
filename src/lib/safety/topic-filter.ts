// Fast, local pre-filter for obviously off-limits user input (PRD §6.7). This
// is a cheap first line before the LLM; the system prompt and second-pass check
// are the authoritative guardrails. Kept intentionally conservative to avoid
// false positives on legitimate chapter topics (e.g. a history chapter about war).

const BLOCK_PATTERNS: readonly RegExp[] = [
  /\b(kill|hurt|harm)\s+(myself|yourself|him|her|them)\b/i,
  /\bsuicide\b/i,
  /\bself[-\s]?harm\b/i,
  /\bhow (?:do|to|can) (?:i|you) (?:make|build) (?:a )?(?:bomb|weapon|gun|drug)/i,
  /\b(porn|pornography|nude|nudes|sex)\b/i,
  /\bwhat(?:'s| is) your (?:address|phone|number)\b/i,
];

export interface TopicVerdict {
  readonly allowed: boolean;
  readonly redirect?: string;
}

export function checkTopic(userText: string): TopicVerdict {
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(userText)) {
      return {
        allowed: false,
        redirect:
          "Let's keep to your chapter — I can't help with that. What would you like to understand from it?",
      };
    }
  }
  return { allowed: true };
}
