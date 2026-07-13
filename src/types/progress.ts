// Local-only progress record (retention loop). Persisted in chrome.storage.local
// keyed by a normalized chapter title. Stores ONLY derived signals — scores and
// short topic labels — never chapter content, so the privacy guarantee holds
// (PRD §7.1): content is still wiped on close; only "how you did" survives.

export interface AttemptRecord {
  readonly at: string; // ISO timestamp
  readonly score: number; // 0..100
}

export interface ChapterProgress {
  readonly key: string; // normalized title
  readonly title: string;
  readonly attempts: readonly AttemptRecord[]; // most recent last
  readonly weakTopics: readonly string[]; // short labels to revisit
  readonly updatedAt: string;
}
