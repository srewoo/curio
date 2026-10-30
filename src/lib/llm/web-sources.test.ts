import { describe, expect, it } from 'vitest';
import { cleanSources } from './web-sources';

describe('cleanSources', () => {
  it('keeps https links only, de-duplicated, hostname as fallback title', () => {
    const out = cleanSources([
      { title: 'NASA', url: 'https://nasa.gov/water' },
      { title: 'dup', url: 'https://nasa.gov/water' },
      { title: 'bad', url: 'javascript:alert(1)' },
      { title: 'plain', url: 'http://example.com' },
      { title: '', url: 'https://kids.britannica.com/x' },
      { url: 'not a url' },
    ]);
    expect(out).toEqual([
      { title: 'NASA', url: 'https://nasa.gov/water' },
      { title: 'kids.britannica.com', url: 'https://kids.britannica.com/x' },
    ]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `${i}`, url: `https://s${i}.org` }));
    expect(cleanSources(many)).toHaveLength(5);
  });
});
