import type { Chunk, RetrievedChunk } from '@/types/session';

// In-memory vector store with brute-force cosine top-k (TRD D5). At ≤~200
// chunks this is sub-millisecond, so no ANN index is warranted. Embeddings are
// L2-normalized on insert, making cosine similarity a plain dot product.

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export class VectorStore {
  private readonly chunks: Chunk[] = [];

  get size(): number {
    return this.chunks.length;
  }

  add(chunks: readonly Chunk[]): void {
    for (const c of chunks) {
      this.chunks.push({ ...c, embedding: normalize(c.embedding) });
    }
  }

  // A spread of up to k chunks across the whole chapter (for a final assessment
  // that should cover all the material, not just what was recently discussed).
  sample(k: number): Chunk[] {
    if (this.chunks.length <= k) return [...this.chunks];
    const step = this.chunks.length / k;
    const out: Chunk[] = [];
    for (let i = 0; i < k; i++) out.push(this.chunks[Math.floor(i * step)]!);
    return out;
  }

  // Top-k by cosine similarity. `queryEmbedding` need not be normalized.
  search(queryEmbedding: Float32Array, k: number): RetrievedChunk[] {
    const q = normalize(queryEmbedding);
    return this.chunks
      .map((chunk) => ({ chunk, score: dot(q, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
