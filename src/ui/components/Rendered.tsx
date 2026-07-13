import { markdownToHtml } from '@/lib/render/markdown';

// Render short Markdown + math (LaTeX/MathML) inline — used for quiz/puzzle
// questions and choices, which may contain equations or chemical formulas.
export function Rendered({ text, className }: { text: string; className?: string }): JSX.Element {
  return <span className={`curio-prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}
