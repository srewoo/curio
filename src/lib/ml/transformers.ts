// One place to load @xenova/transformers with the extension-safe WASM setup:
// single-threaded, non-proxied, served from the extension itself (MV3 CSP
// blocks remote wasm). Model weights download once from huggingface.co and are
// cached by the browser. Dynamically imported to keep the popup bundle small.

type Transformers = typeof import('@xenova/transformers');
let loaded: Promise<Transformers> | null = null;

export function loadTransformers(): Promise<Transformers> {
  loaded ??= import('@xenova/transformers').then((t) => {
    t.env.allowLocalModels = false;
    try {
      const wasm = (t.env.backends as unknown as { onnx?: { wasm?: Record<string, unknown> } } | undefined)?.onnx?.wasm;
      if (wasm) {
        wasm.numThreads = 1;
        wasm.proxy = false;
        if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) wasm.wasmPaths = chrome.runtime.getURL('ort/');
      }
    } catch {
      /* backend shape may vary across versions; ignore */
    }
    return t;
  });
  return loaded;
}
