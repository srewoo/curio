import { EMBEDDING } from '@/config/constants';
import { lexicalEmbed } from './fallback-embed';
import { loadTransformers } from '@/lib/ml/transformers';

// Local embeddings via @xenova/transformers (PRD §6.3, TRD D3/D4). Weights are
// fetched once and cached by the browser, NOT bundled. transformers.js is
// dynamically imported so it stays out of the initial popup bundle.
//
// Robustness (TRD R1/R8): if the neural model cannot load or run inside the
// extension's strict CSP sandbox (onnxruntime has an eval path that MV3 CSP may
// block), we transparently fall back to a lexical embedder so retrieval keeps
// working. The mode is observable via getEmbeddingMode().

type FeatureExtractor = (
  text: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

export type EmbeddingMode = 'unknown' | 'neural' | 'fallback';
let mode: EmbeddingMode = 'unknown';
let extractorPromise: Promise<FeatureExtractor> | null = null;

export function getEmbeddingMode(): EmbeddingMode {
  return mode;
}

async function loadExtractor(): Promise<FeatureExtractor> {
  const { pipeline } = await loadTransformers();
  const pipe = await pipeline('feature-extraction', EMBEDDING.modelId);
  return pipe as unknown as FeatureExtractor;
}

// Warm up the model (first-run "preparing the reader…" state, D3). Never throws:
// on failure it switches to the lexical fallback.
export async function warmUpEmbedder(): Promise<EmbeddingMode> {
  if (mode === 'fallback') return mode;
  try {
    if (!extractorPromise) extractorPromise = loadExtractor();
    await extractorPromise;
    mode = 'neural';
  } catch (err) {
    console.warn('[Curio] Neural embedder unavailable, using lexical fallback.', err);
    extractorPromise = null;
    mode = 'fallback';
  }
  return mode;
}

export async function embedBatch(texts: readonly string[]): Promise<Float32Array[]> {
  if (mode === 'unknown') await warmUpEmbedder();
  if (mode === 'fallback') return texts.map((t) => lexicalEmbed(t));

  try {
    const extractor = await extractorPromise!;
    const out: Float32Array[] = [];
    for (const t of texts) {
      const result = await extractor(t, { pooling: 'mean', normalize: true });
      out.push(new Float32Array(result.data));
    }
    return out;
  } catch (err) {
    // Runtime failure mid-session → degrade gracefully rather than break chat.
    console.warn('[Curio] Neural embedding failed at runtime, switching to fallback.', err);
    mode = 'fallback';
    return texts.map((t) => lexicalEmbed(t));
  }
}

export async function embed(text: string): Promise<Float32Array> {
  const [vec] = await embedBatch([text]);
  if (!vec) throw new Error('Embedding failed.');
  return vec;
}
