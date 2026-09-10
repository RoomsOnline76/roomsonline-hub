/**
 * Saving the bespoke owner pack on its own.
 *
 * Each pack page is stored as a standalone HTML document. To hand the owner one
 * file that prints exactly like the sample, the pages are merged in printed
 * order: the first page's `<head>` (fonts, styles) is kept once and every page
 * body follows it inside its own print-break section.
 */

const bodyOf = (html: string): string => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : html).trim();
};

const headOf = (html: string): string => {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : "";
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export interface OwnerPackPage {
  title: string;
  html: string;
}

/** Merges the pack pages into one printable document titled `documentTitle`. */
export function mergeOwnerPackPages(pages: OwnerPackPage[], documentTitle: string): string {
  const head = pages.length ? headOf(pages[0].html).replace(/<title>[\s\S]*?<\/title>/i, "") : "";
  const sections = pages
    .map(
      (page) =>
        `<section class="rol-pack-page" aria-label="${escapeHtml(page.title)}">${bodyOf(
          page.html,
        )}</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(documentTitle)}</title>
${head}
<style>
  .rol-pack-page { break-after: page; page-break-after: always; }
  .rol-pack-page:last-child { break-after: auto; page-break-after: auto; }
</style>
</head>
<body>
${sections}
</body>
</html>`;
}

/** Filename-safe slug for the saved pack. */
export function packFileName(documentTitle: string): string {
  const slug = documentTitle
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${slug || "owner-pack"}.html`;
}
