/**
 * Repairs spreadsheet uploads whose OOXML parts are written in UTF-16.
 *
 * protel's "House State" export (and its sibling protel reports) writes every
 * XML part inside the xlsx zip — `xl/workbook.xml`, `xl/worksheets/sheetN.xml`,
 * `[Content_Types].xml`, `_rels/.rels`, `xl/sharedStrings.xml` — as UTF-16 big
 * endian with a `FE FF` byte-order mark. SheetJS assumes UTF-8 and throws
 * `Unknown Namespace:` on the first part it touches, so a perfectly valid
 * workbook is rejected as unreadable.
 *
 * `repairWorkbookBuffer` re-encodes those parts to UTF-8 and rebuilds the
 * archive. Workbooks without a UTF-16 BOM are returned untouched, so
 * NightsBridge / OPERA / CheetaPlains uploads are unaffected.
 */
import JSZip from "npm:jszip@3.10.1";

export interface WorkbookRepairResult {
  buffer: ArrayBuffer;
  /** True when at least one part had to be transcoded. */
  repaired: boolean;
  /** Parts that were transcoded, for the run timeline. */
  parts: string[];
  /** Encoding found, when repaired. */
  encoding: "utf-16be" | "utf-16le" | null;
}

const isZip = (bytes: Uint8Array): boolean =>
  bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

const bomEncoding = (bytes: Uint8Array): "utf-16be" | "utf-16le" | null => {
  if (bytes.length < 2) return null;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
};

/** UTF-16 BE has no TextDecoder label in every runtime — swap to LE ourselves. */
function decodeUtf16(bytes: Uint8Array, encoding: "utf-16be" | "utf-16le"): string {
  if (encoding === "utf-16le") return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  const body = bytes.subarray(2);
  const swapped = new Uint8Array(body.length);
  for (let i = 0; i + 1 < body.length; i += 2) {
    swapped[i] = body[i + 1];
    swapped[i + 1] = body[i];
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

const TEXT_PART = /\.(xml|rels)$/i;

/**
 * Returns a buffer SheetJS can read. Never throws: on any failure the original
 * buffer comes back so the caller's own error handling stays in charge.
 */
export async function repairWorkbookBuffer(buffer: ArrayBuffer): Promise<WorkbookRepairResult> {
  const untouched: WorkbookRepairResult = { buffer, repaired: false, parts: [], encoding: null };
  const bytes = new Uint8Array(buffer);
  if (!isZip(bytes)) return untouched;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    const rebuilt = new JSZip();
    const parts: string[] = [];
    let encoding: "utf-16be" | "utf-16le" | null = null;

    for (const name of names) {
      const entry = zip.files[name];
      if (entry.dir) continue;
      const raw: Uint8Array = await entry.async("uint8array");
      let data = raw;
      if (TEXT_PART.test(name)) {
        const found = bomEncoding(raw);
        if (found) {
          const text = decodeUtf16(raw, found);
          data = new TextEncoder().encode(
            text.replace(/encoding\s*=\s*"UTF-16(?:BE|LE)?"/i, 'encoding="utf-8"'),
          );
          parts.push(name);
          encoding = found;
        }
      }
      rebuilt.file(name, data);
    }

    if (parts.length === 0) return untouched;

    const output = (await rebuilt.generateAsync({ type: "uint8array" })) as Uint8Array;
    return {
      buffer: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
      repaired: true,
      parts,
      encoding,
    };
  } catch {
    return untouched;
  }
}

/** Human-readable note for the run timeline. */
export const workbookRepairNote = (filename: string, result: WorkbookRepairResult): string =>
  `${filename}: ${result.encoding ?? "UTF-16"} workbook re-encoded to UTF-8 before reading (${result.parts.length} part(s))`;
