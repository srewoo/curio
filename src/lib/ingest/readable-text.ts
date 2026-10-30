// Turn an HTML document into plain, paragraph-separated text with Markdown-ish
// headings and bullets. Used for EPUB chapters (root given) AND injected into a
// web page via chrome.scripting.executeScript (no root → picks the page's main
// content and skips site chrome). It must stay SELF-CONTAINED: no imports and
// no references to outer scope, because executeScript serializes its source.
export function readableText(root?: ParentNode): string {
  const isPage = root === undefined;
  const scope: ParentNode =
    root ??
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.querySelector('[role="main"]') ??
    document.body;
  const skip = isPage
    ? 'nav,header,footer,aside,form,script,style,noscript,iframe,svg,button,[aria-hidden="true"],[hidden]'
    : 'script,style,noscript';
  const blocks = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,figcaption,td,th,dt,dd';
  const out: string[] = [];
  scope.querySelectorAll(blocks).forEach((el) => {
    if (el.closest(skip)) return;
    // Nested blocks (li > p) are covered by their outermost block.
    if (el.parentElement?.closest(blocks) && scope.contains(el.parentElement.closest(blocks))) return;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
    else if (tag === 'li') out.push(`- ${text}`);
    else out.push(text);
  });
  const joined = out.join('\n\n');
  return (joined || (scope.textContent ?? '').replace(/[ \t]+/g, ' ')).slice(0, 400_000).trim();
}
