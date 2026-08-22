/**
 * Helpers for viewing / printing generated report HTML.
 *
 * Storage serves the stored HTML as plain text, so it is re-wrapped as an HTML
 * blob URL for the iframe. Browsers name a saved PDF after the *top-level*
 * document title, so printing an embedded report needs the parent title swapped
 * to the report's own `<title>` for the duration of the print dialog.
 */

export interface RenderableReport {
  /** Blob URL that renders as HTML inside an iframe. */
  url: string;
  /** The report's own document title — used as the PDF filename. */
  documentTitle: string | null;
}

/** Reads the `<title>` out of a generated report document. */
export function extractDocumentTitle(html: string): string | null {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const text = match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return text || null;
}

/** Wraps raw HTML in a blob URL with an explicit HTML content type. */
export function htmlToBlobUrl(html: string): string {
  return URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
}

/** Fetches a stored report and returns a renderable URL plus its document title. */
export async function toRenderableReport(signedUrl: string): Promise<RenderableReport> {
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) return { url: signedUrl, documentTitle: null };
    const html = await response.text();
    return { url: htmlToBlobUrl(html), documentTitle: extractDocumentTitle(html) };
  } catch {
    return { url: signedUrl, documentTitle: null };
  }
}

/**
 * Prints an embedded report using the report's own title so the browser's
 * "Save as PDF" dialog proposes the correct filename. The previous title is
 * restored once the dialog closes.
 */
export function printFrameWithTitle(
  frame: HTMLIFrameElement | null,
  documentTitle?: string | null,
): void {
  const win = frame?.contentWindow;
  if (!win) return;

  const previous = document.title;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };

  if (documentTitle) {
    document.title = documentTitle;
    window.addEventListener("afterprint", restore);
    // Safety net for browsers that never fire afterprint.
    window.setTimeout(restore, 60_000);
  }

  win.focus();
  win.print();

  if (!documentTitle) restore();
}

const clickDownload = (url: string, filename?: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  if (filename) anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

/**
 * Saves a remote file without ever showing the user a foreign host. The file is
 * fetched and handed to the browser as a local blob, because `download` is
 * ignored on cross-origin links (which would navigate instead of saving).
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    clickDownload(objectUrl, filename ?? url.split("/").pop()?.split("?")[0]);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    clickDownload(url, filename);
  }
}
