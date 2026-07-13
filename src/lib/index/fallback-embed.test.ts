import { describe, it, expect } from 'vitest';
import { lexicalEmbed } from './fallback-embed';

function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s; // vectors are already L2-normalized
}

describe('lexical fallback embedder (TRD R1)', () => {
  it('produces unit-normalized vectors', () => {
    const v = lexicalEmbed('plants make food using sunlight');
    expect(cosine(v, v)).toBeCloseTo(1, 4);
  });

  it('scores related text higher than unrelated text', () => {
    const query = lexicalEmbed('how do plants make food from sunlight');
    const related = lexicalEmbed('plants use sunlight to make food during photosynthesis');
    const unrelated = lexicalEmbed('the treaty was signed after a long war in Europe');
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it('handles empty text without NaN', () => {
    const v = lexicalEmbed('');
    expect(cosine(v, v)).toBe(0);
  });
});
