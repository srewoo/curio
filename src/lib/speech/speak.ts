// Read-aloud via the browser's built-in speechSynthesis — free, no network
// egress of its own, works for pre-readers. Text is flattened from the tutor's
// Markdown so the voice doesn't read symbols, diagrams or citation chips.

export function toSpeakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // code + mermaid diagrams
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s?\[p\.\s*\d{1,4}\]/g, '')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1') // keep math content, drop delimiters
    .replace(/\\(?:frac|times|cdot|ce|text|mathrm)/g, ' ')
    .replace(/[\\{}]/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_`>|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(md: string, language: string, age: number, onEnd?: () => void): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(toSpeakable(md));
  u.lang = language;
  u.rate = age <= 9 ? 0.9 : 1;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
