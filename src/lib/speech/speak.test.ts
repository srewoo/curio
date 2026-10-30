import { describe, expect, it } from 'vitest';
import { toSpeakable } from './speak';

describe('toSpeakable', () => {
  it('drops markdown symbols, citations and diagrams', () => {
    const md = '## Water\n**Evaporation** turns water to vapour [p. 3].\n```mermaid\nA-->B\n```\nDone.';
    expect(toSpeakable(md)).toBe('Water\nEvaporation turns water to vapour.\nDone.');
  });

  it('keeps math content without delimiters', () => {
    expect(toSpeakable('So $2 + 3 = 5$.')).toBe('So 2 + 3 = 5.');
  });

  it('reads link text, not URLs', () => {
    expect(toSpeakable('See [the map](https://x.y).')).toBe('See the map.');
  });
});
