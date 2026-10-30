import { describe, expect, it } from 'vitest';
import { citationsToHtml, keepValidCitations } from './citations';

describe('keepValidCitations', () => {
  it('keeps citations to retrieved pages and drops the rest', () => {
    const text = 'Water evaporates [p. 3]. Clouds form [p. 9]. Rain falls [p.4].';
    expect(keepValidCitations(text, new Set([3, 4]))).toBe('Water evaporates [p. 3]. Clouds form. Rain falls [p.4].');
  });

  it('leaves text without citations alone', () => {
    expect(keepValidCitations('No cites here.', new Set())).toBe('No cites here.');
  });
});

describe('citationsToHtml', () => {
  it('turns citations into clickable chips carrying the page', () => {
    const html = citationsToHtml('<p>Evaporation [p. 12].</p>');
    expect(html).toContain('class="curio-cite"');
    expect(html).toContain('data-page="12"');
    expect(html).not.toContain('[p. 12]');
  });
});
