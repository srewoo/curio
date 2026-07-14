// Dynamically load Mermaid to avoid blocking the initial extension load.
// Once imported, initialize it with child-safe neutral theme configurations.
let mermaidPromise: Promise<any> | null = null;

export function loadMermaid(): Promise<any> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose', // Needed to support element insertion in React virtual DOM
        fontFamily: 'system-ui, -apple-system, sans-serif',
      });
      return m.default;
    });
  }
  return mermaidPromise;
}
