import JSZip from 'jszip';
import { expect, test, uploadFile } from './fixtures';

// A minimal EPUB3: two chapters + a nav table of contents.
async function makeEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Earth Science</dc:title></metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`,
  );
  const page = (h: string, p: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${h}</h1><p>${p}</p></body></html>`;
  zip.file('OEBPS/text/ch1.xhtml', page('The Water Cycle', 'Evaporation happens when the sun heats water and it turns into vapour.'));
  zip.file('OEBPS/text/ch2.xhtml', page('Rocks', 'Igneous rocks form when hot magma cools down and becomes solid.'));
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
      <nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Chapter 1: The Water Cycle</a></li>
      <li><a href="text/ch2.xhtml">Chapter 2: Rocks</a></li></ol></nav></body></html>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('EPUB book → pick a chapter → reopen another chapter without re-uploading', async ({ curio: page }) => {
  await uploadFile(page, 'earth.epub', 'application/epub+zip', await makeEpub());

  await expect(page.getByText('Which chapter do you want to learn?')).toBeVisible();
  await expect(page.getByText('Chapter 2: Rocks')).toBeVisible();
  await page.getByText('Chapter 1: The Water Cycle').click();

  await expect(page.getByText('Chapter 1: The Water Cycle · Earth Science')).toBeVisible();
  await page.getByRole('button', { name: 'Chapters' }).click();
  await page.getByText('Chapter 2: Rocks').click();
  await expect(page.getByText('Chapter 2: Rocks · Earth Science')).toBeVisible();

  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText(/Earth Science · 2 chapters/)).toBeVisible();
});
