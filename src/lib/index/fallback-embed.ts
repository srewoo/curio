import { EMBEDDING } from '@/config/constants';

// Deterministic lexical fallback embedding (TRD R1/R8). If the neural model
// (transformers.js/onnxruntime) can't load or run inside the extension's strict
// CSP sandbox, we fall back to this so retrieval keeps working — lower quality
// (keyword-level), but the tutor never hard-fails. Word tokens + char trigrams
// are hashed into a fixed-dim bag, sublinear-scaled, and L2-normalized so cosine
// similarity is meaningful against the same encoder.

const DIM = EMBEDDING.dimensions;

// FNV-1a 32-bit hash → bucket index.
function bucket(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % DIM;
}

function bump(v: Float32Array, i: number, by: number): void {
  v[i] = (v[i] ?? 0) + by;
}

export function lexicalEmbed(text: string): Float32Array {
  const v = new Float32Array(DIM);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const t of tokens) {
    bump(v, bucket(t), 1);
    // Char trigrams give partial-match signal (plural/typo tolerance).
    for (let i = 0; i + 3 <= t.length; i++) bump(v, bucket(t.slice(i, i + 3)), 0.5);
  }
  // Sublinear term scaling, then L2-normalize.
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    const x = v[i] ?? 0;
    const y = x > 0 ? 1 + Math.log(x) : x;
    v[i] = y;
    norm += y * y;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}
