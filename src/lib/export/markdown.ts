import type { ChatTurn } from '@/types/session';

// Export a chat as a Markdown study sheet (saved locally; nothing uploaded).
export function chatToMarkdown(title: string, history: readonly ChatTurn[], at: Date): string {
  const lines = [`# ${title}`, '', `_Study session exported from Curio on ${at.toISOString().slice(0, 10)}_`, ''];
  for (const turn of history) {
    lines.push(turn.role === 'user' ? `**You:** ${turn.text}` : `**Curio:** ${turn.text}`);
    for (const s of turn.webSources ?? []) lines.push(`  - Source: [${s.title}](${s.url})`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function safeFileName(title: string, ext: string): string {
  const base = title.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'curio';
  return `${base}.${ext}`;
}

// Extension pages may download blobs directly (no downloads permission).
export function downloadText(fileName: string, text: string, mime = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
