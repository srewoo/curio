import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown';

describe('markdownToHtml with SVG and Mermaid support', () => {
  it('should compile standard markdown to HTML', () => {
    const md = 'Hello **world**';
    const html = markdownToHtml(md);
    expect(html).toContain('<strong>world</strong>');
  });

  it('should preserve inline SVG tags and attributes', () => {
    const md = 'Here is a diagram: <svg viewBox="0 0 100 100" class="test"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /></svg>';
    const html = markdownToHtml(md);
    expect(html).toContain('<svg viewBox="0 0 100 100" class="test">');
    expect(html).toContain('<circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />');
  });

  it('should convert Mermaid fenced code blocks to custom placeholder divs', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```';
    const html = markdownToHtml(md);
    expect(html).toContain('<div class="curio-mermaid my-4" data-code="graph TD\n  A --&gt; B"></div>');
  });
});
