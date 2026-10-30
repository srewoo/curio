// In-memory session state (TRD §6). Lives ONLY in the popup page context and is
// destroyed on window close (PRD §6.1). Never persisted.

export interface PageExtract {
  readonly index: number; // 1-based page number
  readonly sourceName: string;
  readonly markdown: string; // verbatim text + [FIGURE]/[TABLE] blocks
  readonly status: 'ok' | 'failed' | 'rejected'; // rejected = moderation gate
  readonly reason?: string;
}

export interface Chunk {
  readonly id: string;
  readonly page: number;
  readonly text: string;
  readonly embedding: Float32Array;
}

export interface RetrievedChunk {
  readonly chunk: Chunk;
  readonly score: number; // cosine similarity
}

export type ChatRole = 'user' | 'tutor';

export interface FollowUp {
  readonly text: string;
}

import type { ErrorKind } from './mastery';

export interface ChatTurn {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly groundedChunkIds: readonly string[];
  readonly followUps?: readonly FollowUp[];
  // True if a pure-numeric equality in this answer failed arithmetic
  // verification (src/lib/math/verify.ts) — surfaced, never auto-corrected.
  readonly arithmeticFlag?: boolean;
  // Set when the tutor turn is the reply to an "explain it back" attempt.
  readonly explainScore?: number;
  // Set when the answer came from the web (not the chapter).
  readonly webSources?: readonly { readonly title: string; readonly url: string }[];
  // Gemini only: Google's Search Suggestions markup, shown in a sandboxed frame.
  readonly searchEntryHtml?: string;
}

export type PuzzleKind = 'mcq' | 'fill-blank' | 'true-false';

export interface Puzzle {
  readonly kind: PuzzleKind;
  readonly question: string;
  readonly choices: readonly string[]; // empty for fill-blank
  readonly correctIndex: number; // index into choices; 0/1 for true-false
  readonly explanation: string;
  readonly conceptId?: string;
}

export interface ChapterSummary {
  readonly title: string;
  readonly overview: string;
  readonly starters: readonly string[];
}

// Final assessment (PRD progress feature): a few MCQs + 1–3 short-answer text
// questions, graded to an overall score once the student has worked through the
// chapter.
export interface AssessmentQuestion {
  readonly id: string;
  readonly kind: 'mcq' | 'text';
  readonly question: string;
  readonly choices: readonly string[]; // [] for text questions
  readonly correctIndex: number; // -1 for text questions
  readonly rubric: string; // what a good text answer contains; '' for mcq
  readonly conceptId?: string; // which chapter concept this question checks
}

export interface AssessmentAnswer {
  readonly questionId: string;
  readonly choiceIndex: number | null;
  readonly text: string;
}

export interface GradedItem {
  readonly question: AssessmentQuestion;
  readonly answer: AssessmentAnswer;
  readonly score: number; // 0..1
  readonly feedback: string;
  readonly errorKind?: ErrorKind; // why a missed answer missed (text questions)
}

export interface AssessmentResult {
  readonly items: readonly GradedItem[];
  readonly overallScore: number; // 0..100
  readonly ratingOutOf10: number; // 0..10
  readonly summary: string;
}
