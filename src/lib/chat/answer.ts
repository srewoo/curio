import type { Settings } from '@/types/settings';
import type { RetrievedChunk } from '@/types/session';
import type { BrokerError, LlmUsage } from '@/types/messages';
import type { VectorStore } from '@/lib/index/vector-store';
import type { ChatTurn } from '@/types/session';
import { checkTopic } from '@/lib/safety/topic-filter';
import { retrieve } from '@/lib/rag/retriever';
import { generateFollowUps } from '@/lib/rag/retriever';
import { buildChatMessages } from '@/lib/rag/prompt';
import { buildTutorSystemPrompt } from '@/lib/safety/system-prompt';
import { needsSecondPass, reviewIsSafe } from '@/lib/safety/second-pass';
import { callBroker } from '@/lib/llm/client';
import { hasArithmeticError } from '@/lib/math/verify';

// One full grounded tutor turn (TRD §9). Encapsulates topic filter →
// retrieval + groundedness gate → grounded answer → second-pass safety →
// follow-ups, so the UI store stays thin.

const NOT_IN_CHAPTER = "That's not in this chapter — want me to focus on what is?";
const UNSAFE_REDIRECT = "Let's keep exploring your chapter. What part would you like to understand better?";

// A problem/computation the student wants worked out (any subject). These are
// answered using the chapter's methods even if the exact problem isn't printed
// in it, so the groundedness gate must not hard-refuse them (PRD math/STEM).
const PROBLEM_QUERY =
  /[0-9]\s*[-+×xX*/=^]|[-+×xX*/=^]\s*[0-9]|\\[a-z]+|\$|\b(solve|calculate|compute|evaluate|simplify|factor|expand|derivative|integral|equation|equations|balance|convert|prove|work out|step by step)\b/i;

export type AnswerResult =
  | { readonly kind: 'answer'; readonly text: string; readonly followUps: string[]; readonly retrieved: RetrievedChunk[]; readonly usage: LlmUsage; readonly arithmeticFlag: boolean }
  | { readonly kind: 'refusal'; readonly text: string; readonly retrieved: RetrievedChunk[] }
  | { readonly kind: 'error'; readonly error: BrokerError };

export async function produceAnswer(
  settings: Settings,
  store: VectorStore,
  history: readonly ChatTurn[],
  userText: string,
): Promise<AnswerResult> {
  const topic = checkTopic(userText);
  if (!topic.allowed) return { kind: 'refusal', text: topic.redirect!, retrieved: [] };

  const { chunks, grounded } = await retrieve(store, userText);
  // Explanatory questions must be grounded; problem-solving requests are allowed
  // through (answered via the chapter's methods) even if retrieval is weak.
  if (!grounded && !PROBLEM_QUERY.test(userText)) {
    return { kind: 'refusal', text: NOT_IN_CHAPTER, retrieved: chunks };
  }

  const res = await callBroker({
    kind: 'chat',
    provider: settings.provider,
    model: settings.textModel,
    system: buildTutorSystemPrompt(settings.ageBand, settings.language),
    messages: buildChatMessages(history, chunks, userText),
    maxTokens: 700,
    temperature: 0.3,
  });
  if (!res.ok) return { kind: 'error', error: res.error };

  let text = res.text;
  if (needsSecondPass(settings.ageBand) && !(await reviewIsSafe(settings.provider, text))) {
    text = UNSAFE_REDIRECT;
  }

  const followUps = await generateFollowUps(settings.provider, settings.textModel, chunks, text);
  // Cross-check any pure-numeric equalities in the answer (TRD: step-solver is
  // still LLM prose, not a symbolic solver). We never rewrite the text — only
  // flag it, since an automatic "fix" could itself be wrong.
  const arithmeticFlag = hasArithmeticError(text);
  return { kind: 'answer', text, followUps, retrieved: chunks, usage: res.usage, arithmeticFlag };
}
