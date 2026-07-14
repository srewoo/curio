import { useEffect, useState, type RefObject } from 'react';
import { loadMermaid } from '@/lib/render/mermaid';

// Custom hook to detect and compile Mermaid diagram placeholders in-place.
// If compilation fails, it degrades gracefully by rendering the raw diagram code inside a standard code block.
export function useMermaid(ref: RefObject<HTMLElement>, content: string): boolean {
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const elements = container.querySelectorAll('.curio-mermaid');
    if (elements.length === 0) {
      setRendered(true);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const m = await loadMermaid();
        if (!active) return;

        for (let i = 0; i < elements.length; i++) {
          const el = elements[i] as HTMLElement;
          if (el.getAttribute('data-processed') === 'true') continue;

          const code = el.getAttribute('data-code');
          if (code) {
            const decodedCode = unescapeHtml(code);
            const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
            try {
              const { svg } = await m.render(id, decodedCode);
              if (active) {
                el.innerHTML = svg;
                el.setAttribute('data-processed', 'true');
              }
            } catch (renderErr) {
              console.warn('[Curio] Mermaid render error, falling back to raw view:', renderErr);
              
              // Remove the error element inserted by Mermaid in the body/DOM
              const badSvg = document.getElementById(id);
              if (badSvg) badSvg.remove();
              
              if (active) {
                const pre = document.createElement('pre');
                pre.className = 'bg-paper-2 p-3 rounded text-xs font-mono overflow-auto border border-line text-ink-1';
                const codeNode = document.createElement('code');
                codeNode.textContent = decodedCode;
                pre.appendChild(codeNode);
                el.innerHTML = '';
                el.appendChild(pre);
                el.setAttribute('data-processed', 'true');
              }
            }
          }
        }
        if (active) setRendered(true);
      } catch (err) {
        console.error('[Curio] Failed to load/run Mermaid:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [ref, content]);

  return rendered;
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
