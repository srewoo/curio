import { describe, expect, it } from 'vitest';
import type { PageExtract } from '@/types/session';
import { chapterAvailable } from './store';

const page = (index: number): PageExtract => ({ index, sourceName: 's', markdown: 'x', status: 'ok' });

describe('chapterAvailable', () => {
  const book = { pages: [page(1), page(2), page(3), page(5)] };

  it('is true when every page of the chapter is saved', () => {
    expect(chapterAvailable(book, { id: 'c0', title: 'A', startPage: 1, endPage: 3 })).toBe(true);
  });

  it('is false when a page (e.g. an unread scan) is missing', () => {
    expect(chapterAvailable(book, { id: 'c1', title: 'B', startPage: 4, endPage: 5 })).toBe(false);
  });
});
