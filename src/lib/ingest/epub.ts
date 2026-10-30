import { paginateText, resolveHref, type OutlineEntry } from './structure';
import { readableText } from './readable-text';

// EPUB reader: an EPUB is a zip of XHTML chapters plus an OPF manifest/spine
// and a table of contents (EPUB3 nav or EPUB2 NCX). Text only — images in the
// book are skipped. The TOC gives real chapter boundaries for free.

export interface BookText {
  readonly title: string;
  readonly pages: readonly string[];
  readonly outline: readonly OutlineEntry[];
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function parseXhtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
  // Many EPUBs ship slightly invalid XHTML; fall back to the forgiving parser.
  return doc.getElementsByTagName('parsererror').length > 0 ? new DOMParser().parseFromString(html, 'text/html') : doc;
}

const byTag = (doc: Document | Element, tag: string): Element[] => Array.from(doc.getElementsByTagNameNS('*', tag));

interface TocLink {
  readonly title: string;
  readonly target: string; // archive path, no fragment
}

function navToc(navPath: string, doc: Document): TocLink[] {
  const navs = byTag(doc, 'nav');
  const toc = navs.find((n) => (n.getAttribute('epub:type') ?? '').includes('toc')) ?? navs[0];
  const list = toc ? byTag(toc, 'ol')[0] : undefined;
  if (!list) return [];
  // Top-level entries only: direct <li> children of the first list.
  return Array.from(list.children).flatMap((li) => {
    const a = byTag(li, 'a')[0];
    const href = a?.getAttribute('href');
    return a && href ? [{ title: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), target: resolveHref(navPath, href) }] : [];
  });
}

function ncxToc(ncxPath: string, doc: Document): TocLink[] {
  const navMap = byTag(doc, 'navMap')[0];
  if (!navMap) return [];
  return Array.from(navMap.children)
    .filter((el) => el.localName === 'navPoint')
    .flatMap((np) => {
      const label = byTag(np, 'text')[0]?.textContent ?? '';
      const src = byTag(np, 'content')[0]?.getAttribute('src');
      return src ? [{ title: label.replace(/\s+/g, ' ').trim(), target: resolveHref(ncxPath, src) }] : [];
    });
}

export async function readEpub(file: File): Promise<BookText> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const read = async (path: string): Promise<string> => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`EPUB is missing ${path}`);
    return entry.async('string');
  };

  const opfPath = byTag(parseXml(await read('META-INF/container.xml')), 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not a valid EPUB (no package file).');
  const opf = parseXml(await read(opfPath));
  const title = byTag(opf, 'title')[0]?.textContent?.trim() || file.name.replace(/\.[^.]+$/, '');

  const manifest = new Map<string, { href: string; props: string; type: string }>();
  for (const item of byTag(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifest.set(id, { href: resolveHref(opfPath, href), props: item.getAttribute('properties') ?? '', type: item.getAttribute('media-type') ?? '' });
    }
  }

  const spine = byTag(opf, 'itemref')
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .flatMap((ref) => manifest.get(ref.getAttribute('idref') ?? '')?.href ?? []);

  const pages: string[] = [];
  const docStart = new Map<string, number>(); // spine doc → first page (1-based)
  for (const href of spine) {
    const text = readableText(parseXhtml(await read(href)).documentElement);
    const docPages = paginateText(text);
    if (docPages.length === 0) continue;
    docStart.set(href, pages.length + 1);
    pages.push(...docPages);
  }

  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'));
  const ncxId = byTag(opf, 'spine')[0]?.getAttribute('toc');
  const ncxItem = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
  let toc: TocLink[] = [];
  if (navItem) toc = navToc(navItem.href, parseXhtml(await read(navItem.href)));
  if (toc.length === 0 && ncxItem) toc = ncxToc(ncxItem.href, parseXml(await read(ncxItem.href)));

  const outline = toc.flatMap((t) => {
    const startPage = docStart.get(t.target);
    return startPage ? [{ title: t.title, startPage }] : [];
  });
  return { title, pages, outline };
}
