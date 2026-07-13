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
    expect(validateSelection([file('movie.mp4')]).ok).toBe(false);
    expect(isAcceptedFile(file('movie.mp4'))).toBe(false);
  });

  it('rejects over the total size limit', () => {
    expect(validateSelection([file('big.pdf', INGEST_LIMITS.maxTotalBytes + 1)]).ok).toBe(false);
  });

  it('categorizes by extension', () => {
    expect(extensionCategory(file('a.pdf'))).toBe('pdf');
    expect(extensionCategory(file('a.docx'))).toBe('docx');
    expect(extensionCategory(file('a.txt'))).toBe('txt');
    expect(extensionCategory(file('a.png'))).toBe('image');
  });
});
