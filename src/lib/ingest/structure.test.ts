import { describe, expect, it } from 'vitest';
import { formatClock, groupTranscript, paginateText, resolveHref, spansFromOutline } from './structure';

describe('paginateText', () => {
  it('packs paragraphs up to the limit without splitting them', () => {
    const pages = paginateText('aaaa\n\nbbbb\n\ncccc', 10);
    expect(pages).toEqual(['aaaa\n\nbbbb', 'cccc']);
  });

  it('hard-splits an oversized paragraph', () => {
    expect(paginateText('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('returns nothing for blank text', () => {
    expect(paginateText('  \n\n ')).toEqual([]);
  });
});

describe('spansFromOutline', () => {
  it('builds contiguous spans, skipping front matter and duplicate starts', () => {
    const spans = spansFromOutline(
      [
        { title: 'Cover', startPage: 1 },
        { title: 'Contents', startPage: 2 },
        { title: 'Chapter 2: Plants', startPage: 20 },
        { title: 'Chapter 1: Cells', startPage: 5 },
        { title: 'Dup', startPage: 20 },
      ],
      40,
    );
    expect(spans).toEqual([
      { id: 'c0', title: 'Chapter 1: Cells', startPage: 5, endPage: 19 },
      { id: 'c1', title: 'Chapter 2: Plants', startPage: 20, endPage: 40 },
    ]);
  });

  it('returns null when there is fewer than two real chapters', () => {
    expect(spansFromOutline([{ title: 'Chapter 1', startPage: 1 }], 10)).toBeNull();
    expect(spansFromOutline([{ title: 'Ch', startPage: 99 }, { title: 'X', startPage: 0 }], 10)).toBeNull();
  });
});

describe('groupTranscript', () => {
  it('groups segments into time-labelled pages', () => {
    const pages = groupTranscript(
      [
        { start: 0, end: 4, text: 'Hello' },
        { start: 100, end: 110, text: 'class.' },
        { start: 200, end: 205.4, text: 'Next part' },
      ],
      180,
    );
    expect(pages).toEqual(['[0:00–1:50]\nHello class.', '[3:20–3:25]\nNext part']);
  });

  it('formats hours', () => {
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('resolveHref', () => {
  it('resolves relative paths and drops fragments', () => {
    expect(resolveHref('OEBPS/content.opf', 'text/ch1.xhtml#s1')).toBe('OEBPS/text/ch1.xhtml');
    expect(resolveHref('OEBPS/text/nav.xhtml', '../text/ch2.xhtml')).toBe('OEBPS/text/ch2.xhtml');
    expect(resolveHref('content.opf', 'ch%201.xhtml')).toBe('ch 1.xhtml');
  });
});
