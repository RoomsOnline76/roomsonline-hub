/**
 * Saving a finished report as a Word document.
 *
 * Every report — daily, monthly and bi-monthly — is stored as one printable HTML
 * document. Word opens exactly that markup when it is handed over as a `.doc`
 * with Word's own document namespaces, so the Word download is the same page as
 * the PDF: same headings, tables, graphs, colours and page breaks. Nothing is
 * rebuilt, so the two can never drift apart.
 *
 * Word may show a one-time "this file came from the internet" notice the first
 * time such a file is opened; the document itself opens and prints normally.
 */

/** Word page setup mirroring the print stylesheet the PDF uses. */
const WORD_PAGE_CSS = `
@page WordSection1 { size: 21cm 29.7cm; margin: 1.2cm; }
div.WordSection1 { page: WordSection1; }
body { -webkit-print-color-adjust: exact; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
`;

const headOf = (html: string): string => {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : "";
};

const bodyOf = (html: string): string => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : html).trim();
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Wraps a stored report page as a Word-openable document. */
export function reportHtmlToWord(html: string, documentTitle: string): string {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40" lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(documentTitle)}</title>
${headOf(html).replace(/<title>[\s\S]*?<\/title>/i, "")}
<style>${WORD_PAGE_CSS}</style>
</head>
<body>
<div class="WordSection1">
${bodyOf(html)}
</div>
</body>
</html>`;
}

/** Filename-safe `.doc` name for a saved report. */
export function wordFileName(documentTitle: string): string {
  const slug = documentTitle
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${slug || "report"}.doc`;
}
/** Saves already-loaded report HTML as a Word document. */
export function saveReportHtmlAsWord(html: string, documentTitle: string): void {
  const blob = new Blob([reportHtmlToWord(html, documentTitle)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = wordFileName(documentTitle);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}


/**
 * Reads the stored report at `reportUrl` and saves it as a Word document.
 * Returns a message when the stored file could not be read.
 */
export async function downloadReportAsWord(
  reportUrl: string,
  documentTitle: string,
): Promise<{ ok: boolean; message?: string }> {
  let html = "";
  try {
    const response = await fetch(reportUrl);
    if (!response.ok) return { ok: false, message: "Could not read the stored report." };
    html = await response.text();
  } catch {
    return { ok: false, message: "Could not read the stored report." };
  }

  const blob = new Blob([reportHtmlToWord(html, documentTitle)], {
    type: "application/msword",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = wordFileName(documentTitle);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true };
}
