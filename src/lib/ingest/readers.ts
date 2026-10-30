// Local file readers (PRD §6.2). PDFs → text layer, or page images (pdf.js)
// for the vision model when a page is scanned; .docx → text via mammoth;
// .txt → read directly. EPUB and media live in epub.ts / transcribe.ts. Heavy
// libs are dynamically imported so they stay out of the initial popup bundle.

export interface PageImage {
  readonly mimeType: string;
  readonly dataBase64: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1)); // strip data: prefix
    };
    reader.readAsDataURL(blob);
  });
}

export async function imageFileToPage(file: File): Promise<PageImage> {
  return { mimeType: file.type || 'image/jpeg', dataBase64: await blobToBase64(file) };
}

export interface PdfPage {
  readonly text: string | null; // text layer, when the page has real text
  readonly image: () => Promise<PageImage>; // lazy render for scanned pages
}

export interface PdfBook {
  readonly pages: readonly PdfPage[];
  readonly outline: readonly { title: string; startPage: number }[];
}

type PdfDoc = Awaited<ReturnType<typeof import('pdfjs-dist')['getDocument']>['promise']>;

async function renderPage(doc: PdfDoc, n: number): Promise<PageImage> {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  );
  page.cleanup();
  return { mimeType: 'image/png', dataBase64: await blobToBase64(blob) };
}

// Top-level PDF bookmarks → chapter starts (1-based page numbers).
async function readOutline(doc: PdfDoc): Promise<{ title: string; startPage: number }[]> {
  const items = (await doc.getOutline()) ?? [];
  const out: { title: string; startPage: number }[] = [];
  for (const item of items) {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
      const ref = Array.isArray(dest) ? dest[0] : null;
      if (ref === null || ref === undefined) continue;
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      out.push({ title: item.title, startPage: index + 1 });
    } catch {
      // unresolvable bookmark — skip it
    }
  }
  return out;
}

// Digital PDFs: use the text layer (free, instant). Scanned pages: render to an
// image only when actually needed, so big books don't sit in memory as PNGs.
export async function readPdf(file: File, minTextChars: number, onPage?: (done: number, total: number) => void): Promise<PdfBook> {
  const pdfjs = await import('pdfjs-dist');
  // Worker is bundled by Vite as a URL asset.
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : ''))
      .join('')
      .replace(/[ \t]+/g, ' ')
      .trim();
    pages.push({ text: text.length >= minTextChars ? text : null, image: () => renderPage(doc, n) });
    onPage?.(n, doc.numPages);
  }
  return { pages, outline: await readOutline(doc) };
}

export async function docxToText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

export async function txtToText(file: File): Promise<string> {
  return (await file.text()).trim();
}
