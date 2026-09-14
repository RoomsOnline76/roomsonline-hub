/** Low-memory reader for the Provisional Bookings OOXML export. */
import JSZip from "npm:jszip@3.10.1";
import { isProvisionalGrid, parseProvisionalGrid, type ProvisionalParseResult } from "./provisional.ts";

type Grid = unknown[][];

const decodeXml = async (file: { async: (kind: "uint8array") => Promise<Uint8Array> }): Promise<string> => {
  const bytes = await file.async("uint8array");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2);
    const swapped = new Uint8Array(body.length);
    for (let index = 0; index + 1 < body.length; index += 2) {
      swapped[index] = body[index + 1];
      swapped[index + 1] = body[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  return new TextDecoder().decode(bytes);
};

const unescapeXml = (value: string): string => value
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

const sharedStrings = (xml: string): string[] =>
  [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => unescapeXml(part[1]))
      .join(""),
  );

const columnIndex = (ref: string): number => {
  let index = 0;
  for (const character of ref.replace(/\d/g, "")) index = index * 26 + character.charCodeAt(0) - 64;
  return index - 1;
};

const sheetGrid = (xml: string, strings: string[], maxRows?: number): Grid => {
  const grid: Grid = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: unknown[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cell[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = cell[1].match(/\bt="([^"]+)"/)?.[1] ?? "";
      const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inline = cell[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      let decoded: unknown = unescapeXml(inline ?? value);
      if (type === "s") decoded = strings[Number(value)] ?? "";
      else if (!type && value !== "" && Number.isFinite(Number(value))) decoded = Number(value);
      row[columnIndex(ref)] = decoded;
    }
    grid.push(row);
    if (maxRows && grid.length >= maxRows) break;
  }
  return grid;
};

const relationshipTarget = (rels: string, rid: string): string | null => {
  const tag = [...rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)]
    .map((match) => match[0])
    .find((value) => value.includes(`Id="${rid}"`));
  const target = tag?.match(/Target="([^"]+)"/)?.[1];
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
};

export async function parseProvisionalOoxml(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ProvisionalParseResult | null> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relsFile) return null;
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const [workbookXml, relsXml, sharedXml] = await Promise.all([
    decodeXml(workbookFile),
    decodeXml(relsFile),
    sharedFile ? decodeXml(sharedFile) : Promise.resolve(""),
  ]);
  const strings = sharedStrings(sharedXml);
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)];
  for (const match of sheets) {
    const rid = match[1].match(/r:id="([^"]+)"/)?.[1];
    if (!rid) continue;
    const path = relationshipTarget(relsXml, rid);
    const file = path ? zip.file(path) : null;
    if (!file) continue;
    const xml = await decodeXml(file);
    if (!isProvisionalGrid(sheetGrid(xml, strings, 40))) continue;
    return parseProvisionalGrid(sheetGrid(xml, strings), filename);
  }
  return null;
}