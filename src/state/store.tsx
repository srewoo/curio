import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings';
import type { AssessmentAnswer, AssessmentQuestion, AssessmentResult, ChapterSummary, ChatTurn, Puzzle } from '@/types/session';
import { generateAssessment, DEFAULT_SPEC } from '@/lib/assessment/generate';
import { conceptResultsOf, gradeAssessment } from '@/lib/assessment/grade';
import type { ChapterProgress } from '@/types/progress';
import { getProgress, loadAllProgress, recordAttempt, topicLabel, clearAllProgress, renameProgress, deleteProgress, normalizeChapterKey } from '@/lib/progress/store';
import { findModel } from '@/config/providers';
import { PUZZLE, WEB_SEARCH } from '@/config/constants';
import { loadSettings, saveSettings as persistSettings, hasApiKey } from '@/lib/storage/settings-store';
import { VectorStore } from '@/lib/index/vector-store';
import type { IngestProgress } from '@/lib/ingest/pipeline';
import type { ChapterSpan } from '@/lib/ingest/chapters';
import { generateSummary, retrieve } from '@/lib/rag/retriever';
import { produceAnswer } from '@/lib/chat/answer';
import { generatePuzzle } from '@/lib/puzzle/generate';
import { SessionBudget } from '@/lib/cost/budget';
import { useLearning } from './learning';
import { useIngest, type ChapterChoices, type ReadyChapter } from './ingest';
import type { CapturableTab } from '@/lib/ingest/web-capture';
import type { Concept } from '@/types/mastery';
import type { Chunk } from '@/types/session';
import { checkTopic } from '@/lib/safety/topic-filter';
import { needsSecondPass, reviewIsSafe } from '@/lib/safety/second-pass';
import { clearAllMastery, deleteMastery, renameMastery } from '@/lib/mastery/store';
import { saveLearnerNote } from '@/lib/profile/store';
import { generatePlacement, needsPlacement } from '@/lib/mastery/placement';
import { loadActiveSession, saveActiveSession, clearActiveSession, loadSessionByKey, deleteSessionByKey, renameSessionByKey } from '@/lib/storage/session-store';

export type Screen = 'loading' | 'onboarding' | 'upload' | 'ingesting' | 'chapters' | 'chat' | 'settings' | 'assessment' | 'results' | 'dashboard' | 'review';

interface CurioContextValue {
  readonly screen: Screen;
  readonly settings: Settings;
  readonly ingestProgress: IngestProgress | null;
  readonly ingestNote: string | null;
  readonly summary: ChapterSummary | null;
  readonly history: readonly ChatTurn[];
  readonly turnsUntilPuzzle: number;
  readonly puzzle: Puzzle | null;
  readonly thinking: boolean;
  readonly banner: string | null;
  readonly canAssess: boolean;
  readonly assessmentQuestions: AssessmentQuestion[] | null;
  readonly assessmentResult: AssessmentResult | null;
  readonly assessmentBusy: boolean;
  readonly priorProgress: ChapterProgress | null;
  readonly recentProgress: ChapterProgress[];
  readonly chapterChoices: ChapterChoices | null;
  readonly selectChapterSpan: (span: ChapterSpan, whole?: boolean) => Promise<void>;
  readonly openBookChapters: (bookKey: string) => Promise<void>;
  readonly bookKey: string | undefined; // the open chapter's book, if any
  readonly capturableTab: CapturableTab | null;
  readonly startCapture: () => Promise<void>;
  readonly openSettings: () => void;
  readonly closeSettings: () => void;
  readonly saveSettings: (s: Settings) => Promise<void>;
  readonly refreshKey: () => Promise<void>;
  readonly startIngest: (files: File[]) => Promise<void>;
  readonly ask: (text: string) => Promise<void>;
  readonly dismissPuzzle: () => void;
  readonly notePuzzleResult: (correct: boolean) => void;
  readonly clearChapter: () => void;
  readonly startAssessment: () => Promise<void>;
  readonly submitAssessment: (answers: AssessmentAnswer[]) => Promise<void>;
  readonly backToChat: () => void;
  readonly goToDashboard: () => void;
  readonly backToLibrary: () => void;
  readonly clearProgress: () => Promise<void>;
  readonly loadChapterSession: (key: string) => Promise<void>;
  readonly renameChapter: (key: string, newTitle: string) => Promise<void>;
  readonly deleteChapter: (key: string) => Promise<void>;
  // Learning engine
  readonly concepts: readonly Concept[];
  readonly chapterKey: string | null; // mastery key of the open chapter
  readonly streamingText: string | null;
  readonly explainTarget: Concept | null;
  readonly startExplain: () => void;
  readonly cancelExplain: () => void;
  readonly reviewScope: string | null; // chapter key, or null = everything due
  readonly startReview: (scope: string | null) => void;
  readonly endReview: () => Promise<void>;
  readonly sourcesFor: (turn: ChatTurn, page: number) => Chunk[];
  readonly assessmentKind: 'quiz' | 'placement';
  readonly canPlace: boolean; // new chapter: offer the opening placement check
  readonly startPlacement: () => Promise<void>;
  readonly learnerNote: string;
  readonly saveLearnerNote: (note: string) => Promise<void>;
}

const CurioContext = createContext<CurioContextValue | null>(null);

let idCounter = 0;
const nextId = (): string => `t${++idCounter}`;

export function CurioProvider({ children }: { children: ReactNode }): JSX.Element {
  const [screen, setScreen] = useState<Screen>('loading');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [thinking, setThinking] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[] | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const [priorProgress, setPriorProgress] = useState<ChapterProgress | null>(null);
  const [recentProgress, setRecentProgress] = useState<ChapterProgress[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [reviewScope, setReviewScope] = useState<string | null>(null);
  const [assessmentKind, setAssessmentKind] = useState<'quiz' | 'placement'>('quiz');
  const learning = useLearning(settings);

  const storeRef = useRef<VectorStore | null>(null);
  const budgetRef = useRef<SessionBudget>(new SessionBudget());
  const prevScreenRef = useRef<Screen>('upload');
  const weakTopicsRef = useRef<string[]>([]); // topics to resurface this session
  const bookKeyRef = useRef<string | undefined>(undefined); // set when the chapter came from a saved book

  // A chapter is indexed (upload, picked book chapter, or web page): build the
  // summary, reload retention progress, persist, and open chat.
  const onChapterReady = useCallback(
    async ({ title, store, bookKey }: ReadyChapter) => {
      storeRef.current = store;
      bookKeyRef.current = bookKey;
      const seed = await retrieve(store, title);
      const generatedSummary = await generateSummary(settings.provider, settings.textModel, title, seed.chunks);
      setSummary(generatedSummary);
      setHistory([]);
      setTurnCount(0);
      // Retention loop: reload prior progress for this chapter and seed the
      // session's weak-topic focus so puzzles/quiz revisit what was hard.
      const prior = await getProgress(title);
      setPriorProgress(prior);
      weakTopicsRef.current = prior ? [...prior.weakTopics] : [];
      void saveActiveSession(title, generatedSummary, [], 0, budgetRef.current.spentUsd, store, bookKey);
      void learning.openChapter(normalizeChapterKey(title), title, store.sample(12));
      setScreen('chat');
    },
    [settings.provider, settings.textModel, learning.openChapter],
  );

  const ingest = useIngest({ settings, goTo: setScreen, setBanner, onReady: onChapterReady });


  useEffect(() => {
    void (async () => {
      const activeSettings = await loadSettings();
      setSettings(activeSettings);
      
      const ok = await hasApiKey();
      if (!ok) {
        setScreen('onboarding');
      } else {
        const restored = await loadActiveSession();
        if (restored) {
          storeRef.current = restored.store;
          setSummary(restored.summary);
          setHistory(restored.history as ChatTurn[]);
          setTurnCount(restored.turnCount);
          budgetRef.current = new SessionBudget(activeSettings.sessionBudgetUsd, restored.spentUsd);
          bookKeyRef.current = restored.bookKey;
          void learning.openChapter(restored.key, restored.title);
          setScreen('chat');
        } else {
          setScreen('upload');
        }
      }
      setRecentProgress(await loadAllProgress());
    })();
  }, []);

  const refreshKey = useCallback(async () => {
    const ok = await hasApiKey();
    setSettings(await loadSettings());
    setScreen(ok ? 'upload' : 'onboarding');
  }, []);

  const saveSettings = useCallback(async (s: Settings) => {
    await persistSettings(s);
    setSettings(s);
    budgetRef.current = new SessionBudget(s.sessionBudgetUsd);
    setScreen((await hasApiKey()) ? prevScreenRef.current : 'onboarding');
  }, []);

  const openSettings = useCallback(() => {
    setScreen((s) => {
      if (s !== 'settings' && s !== 'loading') prevScreenRef.current = s;
      return 'settings';
    });
  }, []);
  const closeSettings = useCallback(() => setScreen(prevScreenRef.current), []);

  const clearChapter = useCallback(() => {
    storeRef.current = null;
    setSummary(null);
    setHistory([]);
    setTurnCount(0);
    setPuzzle(null);
    setAssessmentQuestions(null);
    setAssessmentResult(null);
    setPriorProgress(null);
    ingest.resetIngest();
    bookKeyRef.current = undefined;
    weakTopicsRef.current = [];
    budgetRef.current = new SessionBudget(settings.sessionBudgetUsd);
    learning.closeChapter();
    void clearActiveSession();
    setScreen('upload');
  }, [settings.sessionBudgetUsd, learning.closeChapter, ingest.resetIngest]);

  const addWeakTopic = (label: string): void => {
    const next = [label, ...weakTopicsRef.current.filter((t) => t !== label)].slice(0, 8);
    weakTopicsRef.current = next;
  };

  const notePuzzleResult = useCallback(
    (correct: boolean) => {
      if (!correct && puzzle && puzzle.kind !== 'fill-blank') addWeakTopic(topicLabel(puzzle.question));
      if (puzzle?.conceptId) void learning.record([{ conceptId: puzzle.conceptId, score: correct ? 1 : 0 }]);
    },
    [puzzle, learning.record],
  );

  const startAssessment = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    setAssessmentKind('quiz');
    setAssessmentQuestions(null);
    setAssessmentResult(null);
    setAssessmentBusy(true);
    setScreen('assessment');
    try {
      const chunks = store.sample(12);
      const focus = [...(learning.tutorOptions().struggling ?? []), ...weakTopicsRef.current];
      const qs = await generateAssessment(settings.provider, settings.textModel, settings.ageBand, chunks, DEFAULT_SPEC, focus, learning.concepts);
      setAssessmentQuestions(qs);
    } finally {
      setAssessmentBusy(false);
    }
  }, [settings.provider, settings.textModel, settings.ageBand, learning.concepts, learning.tutorOptions]);

  const submitAssessment = useCallback(
    async (answers: AssessmentAnswer[]) => {
      const store = storeRef.current;
      const qs = assessmentQuestions;
      if (!store || !qs) return;
      setAssessmentBusy(true);
      try {
        const chunks = store.sample(12);
        const result = await gradeAssessment(settings.provider, settings.textModel, qs, answers, chunks);
        setAssessmentResult(result);
        setScreen('results');
        // Placement seeds mastery only; it isn't a scored quiz attempt.
        if (assessmentKind === 'placement') {
          await learning.record(conceptResultsOf(result.items));
          return;
        }
        // Retention loop: fold missed questions into weak topics and persist the
        // attempt (score + topics only — no chapter content) for next time.
        for (const item of result.items) if (item.score < 0.5) addWeakTopic(topicLabel(item.question.question));
        const title = summary?.title ?? 'Your chapter';
        await recordAttempt(title, result.overallScore, weakTopicsRef.current, new Date().toISOString());
        await learning.record(conceptResultsOf(result.items));
        setRecentProgress(await loadAllProgress());
      } finally {
        setAssessmentBusy(false);
      }
    },
    [settings.provider, settings.textModel, assessmentQuestions, summary, learning.record, assessmentKind],
  );

  const startPlacement = useCallback(async () => {
    const store = storeRef.current;
    if (!store || learning.concepts.length === 0) return;
    setAssessmentKind('placement');
    setAssessmentQuestions(null);
    setAssessmentResult(null);
    setAssessmentBusy(true);
    setScreen('assessment');
    try {
      setAssessmentQuestions(
        await generatePlacement(settings.provider, settings.textModel, settings.ageBand, store.sample(12), learning.concepts),
      );
    } finally {
      setAssessmentBusy(false);
    }
  }, [settings.provider, settings.textModel, settings.ageBand, learning.concepts]);

  const backToChat = useCallback(() => setScreen('chat'), []);

  const maybePuzzle = useCallback(
    async (question: string) => {
      const store = storeRef.current;
      if (!store) return;
      const { chunks } = await retrieve(store, question);
      const p = await generatePuzzle(settings.provider, settings.textModel, settings.ageBand, chunks, weakTopicsRef.current, learning.concepts);
      if (p) setPuzzle(p);
    },
    [settings.provider, settings.textModel, settings.ageBand, learning.concepts],
  );

  // An "explain it back" reply: topic-filtered like chat, graded against the
  // chapter, and safety-reviewed for young children before it is shown.
  const answerExplanation = useCallback(
    async (store: VectorStore, text: string): Promise<ChatTurn> => {
      const topic = checkTopic(text);
      if (!topic.allowed) {
        learning.cancelExplain();
        return { id: nextId(), role: 'tutor', text: topic.redirect!, groundedChunkIds: [] };
      }
      const turn = await learning.answerExplain(store, text);
      if (needsSecondPass(settings.ageBand) && !(await reviewIsSafe(settings.provider, turn.text))) {
        return { ...turn, text: "Nice try! Let's look at that part of the chapter together." };
      }
      return turn;
    },
    [learning.answerExplain, learning.cancelExplain, settings.ageBand, settings.provider],
  );

  const ask = useCallback(
    async (text: string) => {
      const store = storeRef.current;
      if (!store || thinking) return;
      if (budgetRef.current.state() === 'exceeded') {
        setBanner("We've reached this session's budget. Adjust it in Settings to keep going.");
        return;
      }
      const userTurn: ChatTurn = { id: nextId(), role: 'user', text, groundedChunkIds: [] };
      setHistory((h) => [...h, userTurn]);
      setThinking(true);
      setBanner(null);
      try {
        let tutorTurn: ChatTurn;
        if (learning.explainTarget) {
          tutorTurn = await answerExplanation(store, text);
        } else {
          const result = await produceAnswer(settings, store, [...history, userTurn], text, {
            tutor: learning.tutorOptions(),
            onText: setStreamingText,
            chapterTitle: summary?.title,
          });
          if (result.kind === 'error') {
            setBanner(bannerFor(result.error.code));
            return;
          }
          tutorTurn = {
            id: nextId(),
            role: 'tutor',
            text: result.text,
            groundedChunkIds: result.kind === 'web' ? [] : result.retrieved.map((r) => r.chunk.id),
            followUps: result.kind === 'answer' ? result.followUps.map((t) => ({ text: t })) : [],
            arithmeticFlag: result.kind === 'answer' ? result.arithmeticFlag : false,
            webSources: result.kind === 'web' ? result.sources : undefined,
            searchEntryHtml: result.kind === 'web' ? result.searchEntryHtml : undefined,
          };
          if (result.kind === 'answer' || result.kind === 'web') {
            const model = findModel(settings.provider, settings.textModel);
            if (model) budgetRef.current.add(result.usage, model);
            if (result.kind === 'web') budgetRef.current.addUsd(WEB_SEARCH.feeEstimateUsd);
          }
        }
        const nextHistory = [...history, userTurn, tutorTurn];
        setHistory(nextHistory);
        setStreamingText(null);
        const nextCount = turnCount + 1;
        setTurnCount(nextCount);

        if (summary) {
          void saveActiveSession(summary.title, summary, nextHistory, nextCount, budgetRef.current.spentUsd, store, bookKeyRef.current);
        }

        if (nextCount % PUZZLE.everyNTurns === 0) await maybePuzzle(text);
      } finally {
        setStreamingText(null);
        setThinking(false);
      }
    },
    [settings, history, turnCount, thinking, maybePuzzle, summary, learning.explainTarget, learning.tutorOptions, answerExplanation],
  );

  const startExplain = useCallback(() => {
    const turn = learning.startExplain();
    if (turn) setHistory((h) => [...h, turn]);
  }, [learning.startExplain]);

  const startReview = useCallback((scope: string | null) => {
    setReviewScope(scope);
    setScreen((s) => {
      if (s !== 'review') prevScreenRef.current = s;
      return 'review';
    });
  }, []);

  const endReview = useCallback(async () => {
    await learning.reload();
    setScreen(prevScreenRef.current === 'review' ? 'upload' : prevScreenRef.current);
  }, [learning.reload]);

  const sourcesFor = useCallback(
    (turn: ChatTurn, page: number): Chunk[] =>
      storeRef.current?.byIds(turn.groundedChunkIds).filter((c) => c.page === page) ?? [],
    [],
  );

  const persistLearnerNote = useCallback(
    async (note: string) => {
      await saveLearnerNote(note);
      learning.setLearnerNote(note.trim());
    },
    [learning.setLearnerNote],
  );

  const dismissPuzzle = useCallback(() => setPuzzle(null), []);

  const goToDashboard = useCallback(() => setScreen('dashboard'), []);
  const backToLibrary = useCallback(() => setScreen('upload'), []);
  const clearProgress = useCallback(async () => {
    await clearAllProgress();
    await clearAllMastery();
    await learning.reload();
    setRecentProgress([]);
  }, [learning.reload]);

  const loadChapterSession = useCallback(async (chapterKey: string) => {
    const restored = await loadSessionByKey(chapterKey);
    if (restored) {
      storeRef.current = restored.store;
      setSummary(restored.summary);
      setHistory(restored.history as ChatTurn[]);
      setTurnCount(restored.turnCount);
      budgetRef.current = new SessionBudget(settings.sessionBudgetUsd, restored.spentUsd);
      bookKeyRef.current = restored.bookKey;
      void learning.openChapter(restored.key, restored.title, restored.store.sample(12));
      setScreen('chat');
    } else {
      setBanner('Could not load that chapter. Please try uploading it again.');
    }
  }, [settings.sessionBudgetUsd, learning.openChapter]);

  const renameChapter = useCallback(async (chapterKey: string, newTitle: string) => {
    await renameSessionByKey(chapterKey, newTitle);
    await renameProgress(chapterKey, newTitle);
    await renameMastery(chapterKey, newTitle);
    setRecentProgress(await loadAllProgress());
    if (summary && normalizeChapterKey(summary.title) === chapterKey) {
      setSummary({
        ...summary,
        title: newTitle,
      });
    }
  }, [summary]);

  const deleteChapter = useCallback(async (chapterKey: string) => {
    await deleteSessionByKey(chapterKey);
    await deleteProgress(chapterKey);
    await deleteMastery(chapterKey);
    setRecentProgress(await loadAllProgress());
    if (summary && normalizeChapterKey(summary.title) === chapterKey) {
      storeRef.current = null;
      setSummary(null);
      setHistory([]);
      setTurnCount(0);
      learning.closeChapter();
      setScreen('upload');
    }
  }, [summary, learning.closeChapter]);

  const value = useMemo<CurioContextValue>(
    () => ({
      screen,
      settings,
      ingestProgress: ingest.progress,
      ingestNote: ingest.note,
      summary,
      history,
      turnsUntilPuzzle: PUZZLE.everyNTurns - (turnCount % PUZZLE.everyNTurns),
      puzzle,
      thinking,
      banner,
      canAssess: summary !== null,
      assessmentQuestions,
      assessmentResult,
      assessmentBusy,
      priorProgress,
      recentProgress,
      chapterChoices: ingest.choices,
      selectChapterSpan: ingest.selectChapterSpan,
      openBookChapters: ingest.openBookChapters,
      bookKey: bookKeyRef.current,
      capturableTab: ingest.capturable,
      startCapture: ingest.startCapture,
      openSettings,
      closeSettings,
      saveSettings,
      refreshKey,
      startIngest: ingest.startIngest,
      ask,
      dismissPuzzle,
      notePuzzleResult,
      clearChapter,
      startAssessment,
      submitAssessment,
      backToChat,
      goToDashboard,
      backToLibrary,
      clearProgress,
      loadChapterSession,
      renameChapter,
      deleteChapter,
      concepts: learning.concepts,
      chapterKey: learning.mastery?.key ?? null,
      streamingText,
      explainTarget: learning.explainTarget,
      startExplain,
      cancelExplain: learning.cancelExplain,
      reviewScope,
      startReview,
      endReview,
      sourcesFor,
      learnerNote: learning.learnerNote,
      saveLearnerNote: persistLearnerNote,
      assessmentKind,
      canPlace: needsPlacement(learning.mastery),
      startPlacement,
    }),
    [assessmentKind, startPlacement, streamingText, learning.concepts, learning.mastery, learning.explainTarget, learning.cancelExplain, learning.learnerNote, startExplain, reviewScope, startReview, endReview, sourcesFor, persistLearnerNote, ingest.progress, ingest.note, ingest.choices, ingest.capturable, ingest.selectChapterSpan, ingest.openBookChapters, ingest.startCapture, ingest.startIngest, screen, settings, summary, history, turnCount, puzzle, thinking, banner, assessmentQuestions, assessmentResult, assessmentBusy, priorProgress, recentProgress, openSettings, closeSettings, saveSettings, refreshKey, ask, dismissPuzzle, notePuzzleResult, clearChapter, startAssessment, submitAssessment, backToChat, goToDashboard, backToLibrary, clearProgress, loadChapterSession, renameChapter, deleteChapter],
  );

  return <CurioContext.Provider value={value}>{children}</CurioContext.Provider>;
}

export function useCurio(): CurioContextValue {
  const ctx = useContext(CurioContext);
  if (!ctx) throw new Error('useCurio must be used within CurioProvider');
  return ctx;
}

function bannerForCode(): Record<string, string> {
  return {
    invalid_key: 'Your API key looks invalid or expired. A grown-up can update it in Settings.',
    no_key: 'No API key set. Ask a grown-up to add one in Settings.',
    rate_limited: 'The tutor is resting for a moment (rate limit). Try again shortly.',
    server: 'The provider had a hiccup. Please try again.',
    network: "Couldn't reach the provider. Check your connection.",
    blocked: 'That response was blocked for safety. Try rephrasing.',
    unknown: 'Something went wrong. Please try again.',
  };
}
function bannerFor(code: string): string {
  return bannerForCode()[code] ?? bannerForCode().unknown!;
}
