// Local file readers (PRD §6.2). PDFs → page images (rendered via pdf.js) for
// the vision model; .docx → text via mammoth; .txt → read directly. Heavy libs
// are dynamically imported so they stay out of the initial popup bundle.

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

// Render each PDF page to a PNG image for the vision extractor.
export async function pdfToPageImages(file: File): Promise<PageImage[]> {
  const pdfjs = await import('pdfjs-dist');
  // Worker is bundled by Vite as a URL asset.
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PageImage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
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
    pages.push({ mimeType: 'image/png', dataBase64: await blobToBase64(blob) });
  }
  return pages;
}

export async function docxToText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

export async function txtToText(file: File): Promise<string> {
  return (await file.text()).trim();
}
