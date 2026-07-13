import { describe, it, expect } from 'vitest';
import { chunkPages } from './chunk';
import { CHUNKING } from '@/config/constants';
import type { PageExtract } from '@/types/session';

const maxChars = CHUNKING.targetTokens * CHUNKING.charsPerToken;

function page(index: number, markdown: string, status: PageExtract['status'] = 'ok'): PageExtract {
  return { index, sourceName: `p${index}`, markdown, status };
}

describe('chunkPages', () => {
  it('keeps a short page as a single chunk', () => {
    const chunks = chunkPages([page(1, 'Photosynthesis is how plants make food.')]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.page).toBe(1);
  });

  it('splits a long page into multiple bounded chunks', () => {
    const para = 'Chlorophyll captures sunlight to power the plant. '.repeat(60); // ~3000 chars
    const long = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkPages([page(2, long)]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(maxChars + 5);
      expect(c.page).toBe(2);
    }
  });

  it('skips failed and rejected pages', () => {
    const chunks = chunkPages([page(1, 'ok text here', 'failed'), page(2, 'rejected', 'rejected')]);
    expect(chunks).toHaveLength(0);
  });
});
