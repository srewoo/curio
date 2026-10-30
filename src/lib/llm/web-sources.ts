import { WEB_SEARCH } from '@/config/constants';
import type { WebSource } from '@/types/messages';

// Normalize provider citations into a short, safe source list: https only,
// de-duplicated by URL, capped, with the hostname as a fallback title.
export function cleanSources(raw: readonly { title?: string | null; url?: string | null }[]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const r of raw) {
    let url: URL;
    try {
      url = new URL(r.url ?? '');
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || seen.has(url.href)) continue;
    seen.add(url.href);
    out.push({ url: url.href, title: r.title?.trim() || url.hostname });
    if (out.length >= WEB_SEARCH.maxSources) break;
  }
  return out;
}
