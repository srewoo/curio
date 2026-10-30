import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '@/types/settings';
import { effectiveTutorMode } from '@/types/settings';
import type { ChatTurn, Chunk } from '@/types/session';
import type { ChapterMastery, Concept, ConceptResult } from '@/types/mastery';
import type { TutorPromptOptions } from '@/lib/safety/system-prompt';
import type { VectorStore } from '@/lib/index/vector-store';
import { extractConcepts } from '@/lib/mastery/extract';
import { ensureConcepts, getMastery, recordConceptResults } from '@/lib/mastery/store';
import { pickExplainConcept, strugglingConcepts } from '@/lib/mastery/mastery';
import { explainPrompt, gradeExplanation } from '@/lib/mastery/explain';
import { loadLearnerNote } from '@/lib/profile/store';
import { retrieve } from '@/lib/rag/retriever';

// Learning-engine state for the active chapter, kept out of the main store:
// concept mastery, the "explain it back" target, and the learner note.

let explainId = 0;

export interface LearningState {
  readonly mastery: ChapterMastery | null;
  readonly concepts: readonly Concept[];
  readonly explainTarget: Concept | null;
  readonly learnerNote: string;
  readonly setLearnerNote: (note: string) => void;
  readonly openChapter: (key: string, title: string, chunks?: readonly Chunk[]) => Promise<void>;
  readonly closeChapter: () => void;
  readonly record: (results: readonly ConceptResult[]) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly tutorOptions: () => TutorPromptOptions;
  readonly startExplain: () => ChatTurn | null;
  readonly cancelExplain: () => void;
  readonly answerExplain: (store: VectorStore, text: string) => Promise<ChatTurn>;
}

export function useLearning(settings: Settings): LearningState {
  const [mastery, setMastery] = useState<ChapterMastery | null>(null);
  const [explainTarget, setExplainTarget] = useState<Concept | null>(null);
  const [learnerNote, setLearnerNote] = useState('');
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    void loadLearnerNote().then(setLearnerNote);
  }, []);

  // Load mastery for a chapter; on first open, extract its concepts in the
  // background (chunks given) so chat isn't blocked by the extra call.
  const openChapter = useCallback(
    async (key: string, title: string, chunks?: readonly Chunk[]) => {
      keyRef.current = key;
      setExplainTarget(null);
      const existing = await getMastery(key);
      setMastery(existing);
      if ((existing && existing.concepts.length > 0) || !chunks) return;
      const concepts = await extractConcepts(settings.provider, settings.textModel, settings.ageBand, chunks);
      const created = await ensureConcepts(key, title, concepts, new Date());
      if (keyRef.current === key) setMastery(created);
    },
    [settings.provider, settings.textModel, settings.ageBand],
  );

  const closeChapter = useCallback(() => {
    keyRef.current = null;
    setMastery(null);
    setExplainTarget(null);
  }, []);

  const record = useCallback(async (results: readonly ConceptResult[]) => {
    const key = keyRef.current;
    if (!key) return;
    const next = await recordConceptResults(key, results, new Date());
    if (next && keyRef.current === key) setMastery(next);
  }, []);

  const reload = useCallback(async () => {
    if (keyRef.current) setMastery(await getMastery(keyRef.current));
  }, []);

  const tutorOptions = useCallback(
    (): TutorPromptOptions => ({
      mode: effectiveTutorMode(settings),
      learnerNote,
      struggling: strugglingConcepts(mastery).map((c) => c.name),
    }),
    [settings, learnerNote, mastery],
  );

  const startExplain = useCallback((): ChatTurn | null => {
    const concept = pickExplainConcept(mastery);
    if (!concept) return null;
    setExplainTarget(concept);
    return { id: `x${++explainId}`, role: 'tutor', text: explainPrompt(concept), groundedChunkIds: [] };
  }, [mastery]);

  const cancelExplain = useCallback(() => setExplainTarget(null), []);

  const answerExplain = useCallback(
    async (store: VectorStore, text: string): Promise<ChatTurn> => {
      const concept = explainTarget!;
      setExplainTarget(null);
      const { chunks } = await retrieve(store, `${concept.name}. ${concept.back}`);
      const grade = await gradeExplanation(settings.provider, settings.textModel, settings.ageBand, concept, chunks, text);
      const id = `x${++explainId}`;
      if (!grade) {
        return { id, role: 'tutor', text: "I couldn't check that just now — let's try again in a moment.", groundedChunkIds: [] };
      }
      await record([{ conceptId: concept.id, score: grade.score }]);
      return {
        id,
        role: 'tutor',
        text: grade.feedback,
        groundedChunkIds: chunks.map((c) => c.chunk.id),
        explainScore: grade.score,
      };
    },
    [explainTarget, settings.provider, settings.textModel, settings.ageBand, record],
  );

  return {
    mastery,
    concepts: mastery?.concepts ?? [],
    explainTarget,
    learnerNote,
    setLearnerNote,
    openChapter,
    closeChapter,
    record,
    reload,
    tutorOptions,
    startExplain,
    cancelExplain,
    answerExplain,
  };
}
