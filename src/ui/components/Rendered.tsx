import { useRef } from 'react';
import { markdownToHtml } from '@/lib/render/markdown';
import { useMermaid } from '@/ui/hooks/useMermaid';

// Render short Markdown + math (LaTeX/MathML) inline — used for quiz/puzzle
// questions and choices, which may contain equations or chemical formulas.
export function Rendered({ text, className }: { text: string; className?: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  useMermaid(ref, text);
  return <span ref={ref} className={`curio-prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}
