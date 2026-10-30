// Per-concept mastery + spaced review (learning engine). Persisted encrypted in
// chrome.storage.local, keyed by normalized chapter title like ChapterProgress.
// Concepts carry a short flashcard (front/back) so reviews need no LLM call.

// fact = something to remember, idea = something to understand,
// skill = a method to carry out. Drives the review interval sequence.
export type ConceptKind = 'fact' | 'idea' | 'skill';

export interface Concept {
  readonly id: string;
  readonly name: string; // short label, ≤ ~6 words
  readonly kind: ConceptKind;
  readonly front: string; // flashcard question
  readonly back: string; // flashcard answer, from the chapter
}

export interface ConceptAttempt {
  readonly at: string; // ISO timestamp
  readonly score: number; // 0..1
}

export interface ConceptState {
  readonly attempts: readonly ConceptAttempt[]; // most recent last, bounded
  readonly step: number; // index into the interval sequence; -1 = relearning
  readonly dueAt: string | null; // ISO; null = never practised
}

export interface ChapterMastery {
  readonly key: string;
  readonly title: string;
  readonly concepts: readonly Concept[];
  readonly states: Readonly<Record<string, ConceptState>>;
  readonly updatedAt: string;
}

export interface ConceptResult {
  readonly conceptId: string;
  readonly score: number; // 0..1
}

// Kid-friendly version of a 4-way error taxonomy, used to tell the child *why*
// an answer missed, not just that it did.
export type ErrorKind = 'forgot' | 'mixed-up' | 'applied-wrong' | 'careless';
