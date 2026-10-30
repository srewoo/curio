import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '@/types/session';
import { chatToMarkdown, safeFileName } from './markdown';

describe('chatToMarkdown', () => {
  it('renders turns, web sources and the export date', () => {
    const history: ChatTurn[] = [
      { id: '1', role: 'user', text: 'What is rain?', groundedChunkIds: [] },
      { id: '2', role: 'tutor', text: 'Water falling [p. 2].', groundedChunkIds: [], webSources: [{ title: 'NASA', url: 'https://nasa.gov' }] },
    ];
    expect(chatToMarkdown('Water', history, new Date('2026-10-30T10:00:00Z'))).toBe(
      '# Water\n\n_Study session exported from Curio on 2026-10-30_\n\n**You:** What is rain?\n\n**Curio:** Water falling [p. 2].\n  - Source: [NASA](https://nasa.gov)\n',
    );
  });
});

describe('safeFileName', () => {
  it('keeps letters and digits, including non-Latin', () => {
    expect(safeFileName('Ch 3: Plants & Soil!', 'md')).toBe('Ch-3-Plants-Soil.md');
    expect(safeFileName('जल चक्र', 'md')).toBe('जल-चक्र.md');
    expect(safeFileName('***', 'md')).toBe('curio.md');
  });
});
