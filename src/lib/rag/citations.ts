// Page citations like "[p. 3]". The tutor is asked to cite the chunk pages it
// used; any citation to a page that was not actually retrieved is dropped, so a
// visible citation always points at a passage the student can open.

const CITE = /\s?\[p\.\s*(\d{1,4})\]/g;

export function keepValidCitations(text: string, pages: ReadonlySet<number>): string {
  return text.replace(CITE, (m, n: string) => (pages.has(Number(n)) ? m : ''));
}

export function citationsToHtml(html: string): string {
  return html.replace(
    /\[p\.\s*(\d{1,4})\]/g,
    (_m, n: string) => `<span class="curio-cite" data-page="${n}" role="button" tabindex="0">p.&nbsp;${n}</span>`,
  );
}
