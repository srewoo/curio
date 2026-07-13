import { describe, it, expect } from 'vitest';
import { extractJson } from './json';

describe('extractJson', () => {
  it('parses a bare JSON array', () => {
    expect(extractJson<string[]>('["a","b","c"]')).toEqual(['a', 'b', 'c']);
  });

  it('parses JSON inside a code fence', () => {
    const text = 'Here you go:\n```json\n{"overview":"hi","starters":["a"]}\n```';
    expect(extractJson<{ overview: string }>(text)?.overview).toBe('hi');
  });

  it('parses JSON surrounded by prose', () => {
    expect(extractJson<{ x: number }>('sure! {"x": 1} done')).toEqual({ x: 1 });
  });

  it('returns null when there is no JSON', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
