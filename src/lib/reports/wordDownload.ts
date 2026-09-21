/**
 * Saving a finished report as an editable Word document.
 *
 * Every report — daily, monthly and bi-monthly — is stored as one printable HTML
 * document, and that same document is what Word receives: it is packed as a
 * genuine `.docx` whose body is an `altChunk` holding the report page. Word
 * opens it without any "this file came from the internet" notice, converts the
 * page into editable Word content on open, and keeps the PDF's headings,
 * tables, graphs, colours and page breaks. Nothing is rebuilt, so the Word file
 * and the PDF can never drift apart.
 */

import JSZip from "jszip";

/** Word page setup mirroring the print stylesheet the PDF uses. */
const WORD_PAGE_CSS = `
@page { size: 21cm 29.7cm; margin: 1.2cm; }
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

/** The report page as the HTML chunk Word converts on open. */
export function reportHtmlForWord(html: string, documentTitle: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(documentTitle)}</title>
${headOf(html).replace(/<title>[\s\S]*?<\/title>/i, "")}
<style>${WORD_PAGE_CSS}</style>
</head>
<body>
${bodyOf(html)}
</body>
</html>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/report.html" ContentType="text/html"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="report.html"/>
</Relationships>`;

/** A4 portrait with the same 1.2cm margins the report prints with. */
const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="rIdChunk"/>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

/** Packs a stored report page as a real `.docx` document. */
export async function reportHtmlToDocx(html: string, documentTitle: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/document.xml", DOCUMENT_XML);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file("word/report.html", reportHtmlForWord(html, documentTitle));
  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/** Filename-safe `.docx` name for a saved report. */
export function wordFileName(documentTitle: string): string {
  const slug = documentTitle
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${slug || "report"}.docx`;
}

/** Saves already-loaded report HTML as an editable Word document. */
export async function saveReportHtmlAsWord(html: string, documentTitle: string): Promise<void> {
  const blob = await reportHtmlToDocx(html, documentTitle);
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

  await saveReportHtmlAsWord(html, documentTitle);
  return { ok: true };
}
