import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings';
import type { AssessmentAnswer, AssessmentQuestion, AssessmentResult, ChapterSummary, ChatTurn, PageExtract, Puzzle } from '@/types/session';
import { generateAssessment, DEFAULT_SPEC } from '@/lib/assessment/generate';
import { gradeAssessment } from '@/lib/assessment/grade';
import type { ChapterProgress } from '@/types/progress';
import { getProgress, loadAllProgress, recordAttempt, topicLabel } from '@/lib/progress/store';
import { findModel } from '@/config/providers';
import { PUZZLE } from '@/config/constants';
import { loadSettings, saveSettings as persistSettings, hasApiKey } from '@/lib/storage/settings-store';
import { VectorStore } from '@/lib/index/vector-store';
import { extractPages, buildIndex, type IngestProgress } from '@/lib/ingest/pipeline';
import { detectChapters, type ChapterSpan } from '@/lib/ingest/chapters';
import { getEmbeddingMode } from '@/lib/index/embeddings';
import { generateSummary, retrieve } from '@/lib/rag/retriever';
import { produceAnswer } from '@/lib/chat/answer';
import { generatePuzzle } from '@/lib/puzzle/generate';
import { SessionBudget } from '@/lib/cost/budget';

export type Screen = 'loading' | 'onboarding' | 'upload' | 'ingesting' | 'chapters' | 'chat' | 'settings' | 'assessment' | 'results';

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
  readonly chapterSpans: ChapterSpan[] | null;
  readonly selectChapterSpan: (span: ChapterSpan) => Promise<void>;
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
}

const CurioContext = createContext<CurioContextValue | null>(null);

let idCounter = 0;
const nextId = (): string => `t${++idCounter}`;

export function CurioProvider({ children }: { children: ReactNode }): JSX.Element {
  const [screen, setScreen] = useState<Screen>('loading');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
  const [ingestNote, setIngestNote] = useState<string | null>(null);
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
  const [chapterSpans, setChapterSpans] = useState<ChapterSpan[] | null>(null);

  const storeRef = useRef<VectorStore | null>(null);
  const budgetRef = useRef<SessionBudget>(new SessionBudget());
  const prevScreenRef = useRef<Screen>('upload');
  const weakTopicsRef = useRef<string[]>([]); // topics to resurface this session
  const pendingPagesRef = useRef<PageExtract[] | null>(null); // extracted, awaiting chapter pick

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      setScreen((await hasApiKey()) ? 'upload' : 'onboarding');
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
    setIngestNote(null);
    setAssessmentQuestions(null);
    setAssessmentResult(null);
    setPriorProgress(null);
    setChapterSpans(null);
    pendingPagesRef.current = null;
    weakTopicsRef.current = [];
    budgetRef.current = new SessionBudget(settings.sessionBudgetUsd);
    setScreen('upload');
  }, [settings.sessionBudgetUsd]);

  const addWeakTopic = (label: string): void => {
    const next = [label, ...weakTopicsRef.current.filter((t) => t !== label)].slice(0, 8);
    weakTopicsRef.current = next;
  };

  const notePuzzleResult = useCallback(
    (correct: boolean) => {
      if (!correct && puzzle && puzzle.kind !== 'fill-blank') addWeakTopic(topicLabel(puzzle.question));
    },
    [puzzle],
  );

  const startAssessment = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    setAssessmentQuestions(null);
    setAssessmentResult(null);
    setAssessmentBusy(true);
    setScreen('assessment');
    try {
      const chunks = store.sample(12);
      const qs = await generateAssessment(settings.provider, settings.textModel, settings.ageBand, chunks, DEFAULT_SPEC, weakTopicsRef.current);
      setAssessmentQuestions(qs);
    } finally {
      setAssessmentBusy(false);
    }
  }, [settings.provider, settings.textModel, settings.ageBand]);

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
        // Retention loop: fold missed questions into weak topics and persist the
        // attempt (score + topics only — no chapter content) for next time.
        for (const item of result.items) if (item.score < 0.5) addWeakTopic(topicLabel(item.question.question));
        const title = summary?.title ?? 'Your chapter';
        await recordAttempt(title, result.overallScore, weakTopicsRef.current, new Date().toISOString());
        setRecentProgress(await loadAllProgress());
      } finally {
        setAssessmentBusy(false);
      }
    },
    [settings.provider, settings.textModel, assessmentQuestions, summary],
  );

  const backToChat = useCallback(() => setScreen('chat'), []);

  // Shared tail for both the auto (single-chapter) and picked (multi-chapter)
  // paths: chunk+embed the chosen page range, build the summary, reload
  // retention progress under the chapter's title, and open chat.
  const finalizeChapter = useCallback(
    async (pages: PageExtract[], span: ChapterSpan, allPagesForNotes: PageExtract[]) => {
      try {
        const result = await buildIndex(pages, setIngestProgress, { start: span.startPage, end: span.endPage });
        storeRef.current = result.store;
        const failed = allPagesForNotes.filter((p) => p.status !== 'ok');
        const notes: string[] = [];
        if (failed.length > 0) notes.push(describeFailures(failed));
        if (getEmbeddingMode() === 'fallback') {
          notes.push('Running in basic reading mode on this device — answers stay grounded in your chapter.');
        }
        setIngestNote(notes.length > 0 ? notes.join(' ') : null);
        if (result.chunkCount === 0) {
          setBanner("I couldn't read any of those pages. Try clearer photos or a different file.");
          setScreen('upload');
          return;
        }
        const title = span.title;
        const seed = await retrieve(result.store, title);
        setSummary(await generateSummary(settings.provider, settings.textModel, title, seed.chunks));
        // Retention loop: reload prior progress for this chapter and seed the
        // session's weak-topic focus so puzzles/quiz revisit what was hard.
        const prior = await getProgress(title);
        setPriorProgress(prior);
        weakTopicsRef.current = prior ? [...prior.weakTopics] : [];
        pendingPagesRef.current = null;
        setChapterSpans(null);
        setScreen('chat');
      } catch {
        setBanner('Something went wrong while reading your chapter. Please try again.');
        setScreen('upload');
      }
    },
    [settings.provider, settings.textModel],
  );

  const startIngest = useCallback(
    async (files: File[]) => {
      setScreen('ingesting');
      setIngestProgress(null);
      setBanner(null);
      try {
        const pages = await extractPages(settings.provider, settings.visionModel, files, setIngestProgress);
        if (!pages.some((p) => p.status === 'ok')) {
          setBanner("I couldn't read any of those pages. Try clearer photos or a different file.");
          setScreen('upload');
          return;
        }
        // One cheap text call to check whether this upload spans more than one
        // chapter/section (e.g. a multi-chapter scan) — most uploads are a
        // single chapter and skip straight through.
        const spans = await detectChapters(settings.provider, settings.textModel, pages);
        if (spans.length <= 1) {
          const auto = spans[0] ?? { id: 'c0', title: 'Your chapter', startPage: 1, endPage: pages.length };
          const title = baseName(files[0]?.name ?? auto.title);
          await finalizeChapter(pages, { ...auto, title }, pages);
          return;
        }
        pendingPagesRef.current = pages;
        setChapterSpans(spans);
        setScreen('chapters');
      } catch {
        setBanner('Something went wrong while reading your chapter. Please try again.');
        setScreen('upload');
      }
    },
    [settings.provider, settings.visionModel, settings.textModel, finalizeChapter],
  );

  const selectChapterSpan = useCallback(
    async (span: ChapterSpan) => {
      const pages = pendingPagesRef.current;
      if (!pages) return;
      setScreen('ingesting');
      setIngestProgress(null);
      await finalizeChapter(pages, span, pages);
    },
    [finalizeChapter],
  );

  const maybePuzzle = useCallback(
    async (question: string) => {
      const store = storeRef.current;
      if (!store) return;
      const { chunks } = await retrieve(store, question);
      const p = await generatePuzzle(settings.provider, settings.textModel, settings.ageBand, chunks, weakTopicsRef.current);
      if (p) setPuzzle(p);
    },
    [settings.provider, settings.textModel, settings.ageBand],
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
        const result = await produceAnswer(settings, store, [...history, userTurn], text);
        if (result.kind === 'error') {
          setBanner(bannerFor(result.error.code));
          return;
        }
        const followUps = result.kind === 'answer' ? result.followUps.map((t) => ({ text: t })) : [];
        const tutorTurn: ChatTurn = {
          id: nextId(),
          role: 'tutor',
          text: result.text,
          groundedChunkIds: result.retrieved.map((r) => r.chunk.id),
          followUps,
          arithmeticFlag: result.kind === 'answer' ? result.arithmeticFlag : false,
        };
        setHistory((h) => [...h, tutorTurn]);
        if (result.kind === 'answer') {
          const model = findModel(settings.provider, settings.textModel);
          if (model) budgetRef.current.add(result.usage, model);
        }
        const nextCount = turnCount + 1;
        setTurnCount(nextCount);
        if (nextCount % PUZZLE.everyNTurns === 0) await maybePuzzle(text);
      } finally {
        setThinking(false);
      }
    },
    [settings, history, turnCount, thinking, maybePuzzle],
  );

  const dismissPuzzle = useCallback(() => setPuzzle(null), []);

  const value = useMemo<CurioContextValue>(
    () => ({
      screen,
      settings,
      ingestProgress,
      ingestNote,
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
      chapterSpans,
      selectChapterSpan,
      openSettings,
      closeSettings,
      saveSettings,
      refreshKey,
      startIngest,
      ask,
      dismissPuzzle,
      notePuzzleResult,
      clearChapter,
      startAssessment,
      submitAssessment,
      backToChat,
    }),
    [screen, settings, ingestProgress, ingestNote, summary, history, turnCount, puzzle, thinking, banner, assessmentQuestions, assessmentResult, assessmentBusy, priorProgress, recentProgress, chapterSpans, selectChapterSpan, openSettings, closeSettings, saveSettings, refreshKey, startIngest, ask, dismissPuzzle, notePuzzleResult, clearChapter, startAssessment, submitAssessment, backToChat],
  );

  return <CurioContext.Provider value={value}>{children}</CurioContext.Provider>;
}

export function useCurio(): CurioContextValue {
  const ctx = useContext(CurioContext);
  if (!ctx) throw new Error('useCurio must be used within CurioProvider');
  return ctx;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function describeFailures(failed: readonly PageExtract[]): string {
  const rejected = failed.filter((p) => p.status === 'rejected');
  if (rejected.length > 0) return `${rejected.length} page(s) were skipped as not suitable for a tutor.`;
  return `Couldn't read ${failed.length} page(s) clearly — re-upload clearer photos if you like.`;
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
