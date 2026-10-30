import { expect, test, uploadFile } from './fixtures';

// Hand-built PDF: two text pages (real text layer, so no vision calls) and two
// top-level bookmarks — exercises the text-layer + outline paths in readers.ts.
function makePdf(): Buffer {
  // Several short lines (one long off-page line gets clipped by pdf.js).
  const lines = (s: string) => `BT /F1 11 Tf 14 TL 40 760 Td ${Array.from({ length: 6 }, () => `(${s}) Tj T*`).join(' ')} ET`;
  const stream1 = lines('Evaporation happens when the sun heats water and it turns into vapour.');
  const stream2 = lines('Igneous rocks form when hot magma cools down and becomes solid rock.');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream1.length} >>\nstream\n${stream1}\nendstream`,
    `<< /Length ${stream2.length} >>\nstream\n${stream2}\nendstream`,
    '<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>',
    '<< /Title (Chapter 1: Water) /Parent 8 0 R /Next 10 0 R /Dest [3 0 R /Fit] >>',
    '<< /Title (Chapter 2: Rocks) /Parent 8 0 R /Prev 9 0 R /Dest [4 0 R /Fit] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('text PDF with bookmarks → chapter picker → chapter opens from the text layer', async ({ curio: page }) => {
  let visionCalls = 0;
  page.context().on('request', (r) => {
    if (r.url().includes('api.anthropic.com') && (r.postData() ?? '').includes('"type":"image"')) visionCalls++;
  });
  await uploadFile(page, 'science.pdf', 'application/pdf', makePdf());

  await expect(page.getByText('Which chapter do you want to learn?')).toBeVisible();
  await page.getByText('Chapter 2: Rocks').click();
  await expect(page.getByText('Chapter 2: Rocks · science')).toBeVisible();
  expect(visionCalls).toBe(0);
});
