import { useCallback, useEffect, useRef, useState } from 'react';

// Voice input via Chrome's webkitSpeechRecognition. NOTE: Chrome sends the
// audio to Google's speech service, so this is opt-in (Settings) and disclosed.
// Minimal local typing — the Web Speech API is not in TypeScript's DOM lib.
interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface Dictation {
  readonly supported: boolean;
  readonly listening: boolean;
  readonly error: string | null;
  readonly toggle: () => void;
}

export function useDictation(language: string, onText: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const Ctor = ctor();

  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = useCallback(() => {
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = language;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results, (r) => r[0]?.transcript ?? '').join('');
      onText(text);
    };
    rec.onerror = (e) =>
      setError(e.error === 'not-allowed' ? 'Microphone access was blocked. A grown-up can allow it in Chrome settings.' : "Couldn't hear that — try again.");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, [Ctor, listening, language, onText]);

  return { supported: Ctor !== null, listening, error, toggle };
}
