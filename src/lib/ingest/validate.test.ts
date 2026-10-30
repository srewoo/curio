import { describe, it, expect } from 'vitest';
import { validateSelection, isAcceptedFile, extensionCategory } from './validate';
import { INGEST_LIMITS } from '@/config/constants';

function file(name: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], name);
}

describe('validateSelection (PRD §6.2/§6.9)', () => {
  it('accepts a valid selection', () => {
    expect(validateSelection([file('page.jpg'), file('notes.pdf')]).ok).toBe(true);
  });

  it('rejects an empty selection', () => {
    expect(validateSelection([]).ok).toBe(false);
  });

  it('rejects too many files', () => {
    const many = Array.from({ length: INGEST_LIMITS.maxFiles + 1 }, (_, i) => file(`p${i}.jpg`));
    expect(validateSelection(many).ok).toBe(false);
  });

  it('rejects an unsupported extension', () => {
    expect(validateSelection([file('setup.exe')]).ok).toBe(false);
    expect(isAcceptedFile(file('setup.exe'))).toBe(false);
  });

  it('accepts books and recordings', () => {
    expect(validateSelection([file('book.epub'), file('lesson.mp4'), file('talk.m4a')]).ok).toBe(true);
  });

  it('rejects over the total size limit', () => {
    const big = file('big.pdf');
    Object.defineProperty(big, 'size', { value: INGEST_LIMITS.maxTotalBytes + 1 });
    expect(validateSelection([big]).ok).toBe(false);
  });

  it('categorizes by extension', () => {
    expect(extensionCategory(file('a.pdf'))).toBe('pdf');
    expect(extensionCategory(file('a.docx'))).toBe('docx');
    expect(extensionCategory(file('a.txt'))).toBe('txt');
    expect(extensionCategory(file('a.png'))).toBe('image');
    expect(extensionCategory(file('a.epub'))).toBe('epub');
    expect(extensionCategory(file('a.MP4'))).toBe('media');
    expect(extensionCategory(file('a.mp3'))).toBe('media');
  });
});
