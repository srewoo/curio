// Central tuning constants. Values that the PRD/TRD flag as "tuned, not
// user-facing" live here (e.g. groundedness threshold, top-k) — TRD §17 O4.

export const INGEST_LIMITS = {
  maxFiles: 10, // PRD §6.2
  maxTotalBytes: 25 * 1024 * 1024, // 25 MB, PRD §6.2
  acceptedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx', 'txt'] as const,
  acceptedMimePrefixes: ['image/'] as const,
} as const;

export const CHUNKING = {
  targetTokens: 500, // PRD §6.3
  overlapTokens: 50,
  // Rough chars-per-token heuristic for the local chunker (no tokenizer dep).
  charsPerToken: 4,
} as const;

export const RETRIEVAL = {
  topK: 5, // TRD §17 O4 — tuned
  // Below this max cosine similarity we treat the query as "not in this
  // chapter" and refuse rather than answer (PRD §6.4, §6.7).
  groundednessThreshold: 0.35, // TRD §17 O4 — tuned on eval set
} as const;

export const PUZZLE = {
  everyNTurns: 5, // PRD §6.5 (configurability is TRD §17 O7)
} as const;

export const SAFETY = {
  // Second-pass safety check applies at/below this age (PRD §6.7, TRD D6).
  secondPassAgeGate: 10,
} as const;

export const RETRY = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
} as const;

export const COST = {
  defaultSessionBudgetUsd: 1.0, // TRD §17 O6 — provisional default
  warnAtFraction: 0.8,
} as const;

// Low text yield from vision extraction => likely a blurry/blank page (PRD §6.9).
export const LOW_TEXT_YIELD_CHARS = 40;

export const EMBEDDING = {
  // Default model; final pick is TRD §17 O1.
  modelId: 'Xenova/bge-small-en-v1.5',
  dimensions: 384,
} as const;
