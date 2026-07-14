import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/contrib/mhchem.mjs'; // \ce{...} chemistry support
import dompurify from 'dompurify';

let DOMPurify = dompurify;
if (typeof window === 'undefined') {
  try {
    // @ts-ignore: jsdom is resolved dynamically in test environments only
    const { JSDOM } = await import(/* @vite-ignore */ 'jsdom');
    const { window: jsdomWindow } = new JSDOM('');
    DOMPurify = dompurify(jsdomWindow as any);
  } catch {
    DOMPurify = {
      sanitize: (html: string) => html,
    } as any;
  }
}

// Render tutor messages as safe Markdown + math (PRD math/STEM support).
// Math uses KaTeX with MathML output — Chrome renders MathML natively, so we
// need no bundled KaTeX fonts/CSS and stay within the strict extension CSP.
// All output is sanitized with DOMPurify (LLM text is semi-trusted).

marked.setOptions({ gfm: true, breaks: true });

marked.use({
  renderer: {
    code(token: { text: string; lang?: string }): string | false {
      const lang = token.lang || '';
      if (lang === 'mermaid') {
        const code = token.text;
        const escapedCode = code
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        return `<div class="curio-mermaid my-4" data-code="${escapedCode}"></div>`;
      }
      return false;
    },
  },
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.trim(), { throwOnError: false, output: 'mathml', displayMode: display });
  } catch {
    return display ? `<pre>${escapeHtml(tex)}</pre>` : escapeHtml(tex);
  }
}

// Pull $$…$$ (block) and $…$ (inline) out before Markdown parsing so the
// parser can't mangle them, then splice the rendered MathML back in.
function extractMath(md: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const push = (html: string): string => {
    blocks.push(html);
    return `@@CURIOMATH${blocks.length - 1}@@`;
  };
  let text = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => push(renderMath(tex, true)));
  text = text.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_m, tex: string) => push(renderMath(tex, false)));
  return { text, blocks };
}

export function markdownToHtml(md: string): string {
  const { text, blocks } = extractMath(md);
  let html = marked.parse(text) as string;
  html = html.replace(/@@CURIOMATH(\d+)@@/g, (_m, i: string) => blocks[Number(i)] ?? '');
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true } });
}
