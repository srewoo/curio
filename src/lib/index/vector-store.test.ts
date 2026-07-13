import { describe, it, expect } from 'vitest';
import { VectorStore } from './vector-store';
import type { Chunk } from '@/types/session';

function chunk(id: string, vec: number[]): Chunk {
  return { id, page: 1, text: id, embedding: new Float32Array(vec) };
}

describe('VectorStore', () => {
  it('returns the nearest chunk by cosine similarity', () => {
    const store = new VectorStore();
    store.add([chunk('a', [1, 0, 0]), chunk('b', [0, 1, 0]), chunk('c', [0, 0, 1])]);
    const results = store.search(new Float32Array([0.9, 0.1, 0]), 2);
    expect(results[0]?.chunk.id).toBe('a');
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('normalizes so magnitude does not change ranking', () => {
    const store = new VectorStore();
    store.add([chunk('big', [10, 0, 0]), chunk('small', [0, 1, 0])]);
    const results = store.search(new Float32Array([2, 0, 0]), 1);
    expect(results[0]?.chunk.id).toBe('big');
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });

  it('reports size', () => {
    const store = new VectorStore();
    store.add([chunk('a', [1, 0, 0])]);
    expect(store.size).toBe(1);
  });
});
