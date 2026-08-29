/**
 * Reads a **consolidated revenue-report comparison grid printed as a PDF** — the
 * Devonvale-style pack where the client keeps no spreadsheet, only the designed
 * one-page comparison sheet:
 *
 * ```text
 *            OTB @ 13 Aug 2026   OTB @ 31 July 2026   Variance   Last Year Actual   OTB vs LY
 * Jul.26     872 487             873 182              -696       784 857            87 630
 * ```
 *
 * The same five columns are printed four times, once per stacked block —
 * Revenue, Occupancy, ADR and RevPAR. RevPAR is always skipped so it can never
 * pollute revenue (same rule as `priorReportWorkbook.ts`).
 *
 * Extraction is position-aware: text items are grouped into visual rows, the
 * fragments of a printed number (`1 830 970` arrives in three pieces) are
 * re-joined by x proximity, and each cell is matched to the block's own column
 * anchors. Nothing is read from fixed page addresses, so a re-skinned pack
 * either still parses or reports "nothing found".
 *
 * Room nights are never printed in these packs, so they are derived as
 * revenue ÷ ADR — the rule the spreadsheet reader already uses.
 */

import { getDocumentProxy } from "npm:unpdf@0.12.1";
import type { PriorReportExtract } from "./priorReportWorkbook.ts";

/* ── Positioned text ───────────────────────────────────────── */

interface Cell {
  text: string;
  x: number;
  /** Right edge, used to re-join the fragments of one printed number. */
  right: number;
  y: number;
}

interface RowLine {
  y: number;
  cells: Cell[];
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const pad = (value: number): string => `${value}`.padStart(2, "0");

/** Tolerant printed-number reader: spaces or commas as separators, `%`, `( )`. */
const printedNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed || /^[-–—]+$/.test(trimmed)) return null;
  const percent = /%$/.test(trimmed);
  let body = trimmed
    .replace(/%$/, "")
    .replace(/[R$€£]/gi, "")
    .replace(/[\s\u00a0\u2009]/g, "")
    .replace(/[,.]+$/, "");
  const bracketed = /^\((.+)\)$/.exec(body);
  if (bracketed) body = `-${bracketed[1]}`;
  // South African print style: comma is the decimal mark (`-27,5%`, `35,5%`).
  if (/^-?\d+,\d{1,2}$/.test(body)) body = body.replace(",", ".");
  body = body.replace(/,/g, "").replace(/\u2212/g, "-");
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
};

const isNumeric = (text: string): boolean => printedNumber(text) !== null;

async function readRows(buffer: ArrayBuffer): Promise<RowLine[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pages: RowLine[][] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const cells: Cell[] = [];
    for (const item of content.items as Array<{ str?: string; width?: number; transform?: number[] }>) {
      const text = (item.str ?? "").trim();
      if (!text || !item.transform) continue;
      const x = item.transform[4];
      const width = Number.isFinite(item.width) ? Number(item.width) : text.length * 4.5;
      cells.push({ text, x, right: x + width, y: item.transform[5] });
    }
    const rows: RowLine[] = [];
    for (const cell of cells) {
      const row = rows.find((candidate) => Math.abs(candidate.y - cell.y) <= 2.5);
      if (row) row.cells.push(cell);
      else rows.push({ y: cell.y, cells: [cell] });
    }
    for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows);
  }
  return pages;
}

const rowText = (row: RowLine): string => row.cells.map((cell) => cell.text).join(" ");

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Re-joins fragments printed as one value (`1 830 970`, `-27,5%`). */
const joinCells = (cells: Cell[], gap = 9): Cell[] => {
  const merged: Cell[] = [];
  for (const cell of cells) {
    const last = merged[merged.length - 1];
    if (last && cell.x - last.right <= gap) {
      last.text = `${last.text}${cell.text}`;
      last.right = cell.right;
      continue;
    }
    merged.push({ ...cell });
  }
  return merged;
};

/* ── Grid model ────────────────────────────────────────────── */

/** The five columns every block prints, left to right. */
const COLUMNS = ["current", "previous", "variance", "lastYear", "vsLastYear"] as const;
type ColumnKey = (typeof COLUMNS)[number];

type BlockKind = "revenue" | "occupancy" | "adr" | "revpar" | "nights" | "unknown";

interface Block {
  kind: BlockKind;
  page: number;
  labels: Partial<Record<ColumnKey, string>>;
  values: Record<ColumnKey, Record<string, number>>;
}

const blockLabel = (text: string): BlockKind | null => {
  const clean = text.trim().toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (clean === "occupancy") return "occupancy";
  if (clean === "adr" || clean === "average daily rate" || clean === "average room rate") return "adr";
  if (clean === "revpar") return "revpar";
  if (clean === "revenue") return "revenue";
  if (clean === "room nights") return "nights";
  return null;
};

const isHeaderRow = (row: RowLine): boolean => {
  const text = rowText(row);
  return /OTB\s*@/i.test(text) || (/\bOTB\b/i.test(text) && /@/.test(text));
};

/** `Jul.26`, `Jul-26`, `Jul 2026` → `2026-07`. */
const monthKey = (raw: string): string | null => {
  const match = /^([A-Za-z]{3,9})\s*[.\-\/ ]\s*(\d{2}|\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const index = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
  if (index < 0) return null;
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (year < 2005 || year > 2100) return null;
  return `${year}-${pad(index + 1)}`;
};

/** `OTB @ 13 Aug 2026` / `as @ 31 July 2026` → ISO date. */
const labelDate = (label: string): string | null => {
  const match = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/.exec(label);
  if (!match) return null;
  const index = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  if (index < 0) return null;
  return `${match[3]}-${pad(index + 1)}-${pad(Number(match[1]))}`;
};

/* ── Parser ────────────────────────────────────────────────── */

interface RawRow {
  key: string;
  cells: Cell[];
}

/** Reads one stacked block: its header labels and its month rows. */
function parseBlock(
  rows: RowLine[],
  page: number,
  kind: BlockKind,
  warnings: string[],
): Block | null {
  // Header lines are the rows above the first month row that mention OTB.
  const headerCells: Cell[] = [];
  const dataRows: RawRow[] = [];
  for (const row of rows) {
    const monthCell = row.cells[0] ? monthKey(row.cells[0].text) : null;
    const numerics = joinCells(row.cells.slice(1)).filter((cell) => isNumeric(cell.text));
    // A month label with no numbers beside it is part of the header stack — the
    // second heading line reads `Aug 2026 | July 2026 | Actual`.
    if (!monthCell || numerics.length < 2) {
      if (isHeaderRow(row) || /variance|last\s*year|actual|^\s*\d{4}\s*$/i.test(rowText(row))) {
        headerCells.push(...row.cells);
      }
      continue;
    }
    dataRows.push({ key: monthCell, cells: numerics });
  }
  if (!dataRows.length) return null;

  // Column anchors from the rows that printed at least the five grid columns.
  const complete = dataRows.filter((row) => row.cells.length >= COLUMNS.length);
  if (!complete.length) {
    warnings.push(`Page ${page}: a ${kind} block printed no complete month row and was skipped.`);
    return null;
  }
  const anchors = COLUMNS.map((_, index) => median(complete.map((row) => row.cells[index].x)));

  const block: Block = {
    kind,
    page,
    labels: {},
    values: {
      current: {},
      previous: {},
      variance: {},
      lastYear: {},
      vsLastYear: {},
    },
  };

  for (const row of dataRows) {
    if (row.cells.length >= COLUMNS.length) {
      COLUMNS.forEach((column, index) => {
        const value = printedNumber(row.cells[index].text);
        if (value !== null) block.values[column][row.key] = value;
      });
      continue;
    }
    const taken = new Set<number>();
    for (const cell of row.cells) {
      let best = -1;
      let bestDistance = Infinity;
      anchors.forEach((anchor, index) => {
        if (taken.has(index)) return;
        const distance = Math.abs(anchor - cell.x);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      // Print columns sit ~48pt apart; anything further out is a side note.
      if (best < 0 || bestDistance > 45) continue;
      taken.add(best);
      const value = printedNumber(cell.text);
      if (value !== null) block.values[COLUMNS[best]][row.key] = value;
    }
  }

  // Header text belongs to the anchor it sits above.
  const labelParts: Record<number, string[]> = {};
  for (const cell of [...headerCells].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let best = -1;
    let bestDistance = Infinity;
    anchors.forEach((anchor, index) => {
      const distance = Math.abs(anchor - cell.x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best < 0 || bestDistance > 45) continue;
    (labelParts[best] ??= []).push(cell.text);
  }
  for (const [index, parts] of Object.entries(labelParts)) {
    block.labels[COLUMNS[Number(index)]] = parts.join(" ").replace(/\s+/g, " ").trim();
  }

  return block;
}

const emptyExtract = (): PriorReportExtract => ({
  asOfDate: null,
  otbColumnLabel: null,
  months: [],
  previousOtbRevenue: {},
  previousRoomNights: {},
  lastYearActual: {},
  lastYearRoomNights: {},
  dinnerByMonth: {},
  room0ByMonth: {},
  compRnsByMonth: {},
  previousOccupancy: {},
  lastYearOccupancy: {},
  previousAdr: {},
  lastYearAdr: {},
  currentOtbRevenue: {},
  currentOtbOccupancy: {},
  currentOtbAdr: {},
  currentRoomNights: {},
  baselineSheet: null,
  targets: {},
  targetUplift: null,
  historicalRevenue: {},
  historicalRoomNights: {},
  historicalOccupancy: {},
  historicalAdr: {},
  actualsByYear: {},
  stlyRevenue: {},
  stlyRoomNights: {},
  budgetRevenue: {},
  budgetRoomNights: {},
  carryForward: {},
  sheetsRead: [],
  sheetsSkipped: [],
  warnings: [],
});

/** Nights implied by revenue ÷ ADR; ignored when either side is missing. */
const nightsFromAdr = (
  revenue: Record<string, number>,
  adr: Record<string, number>,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(revenue)) {
    const rate = Number(adr[key]);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(value) || value <= 0) continue;
    out[key] = Math.round(value / rate);
  }
  return out;
};

/**
 * True when the buffer looks like a printed comparison grid (as opposed to a
 * CheetaPlains-style owner pack, which the owner reader handles).
 */
export const looksLikeComparisonGrid = (text: string): boolean => {
  const upper = text.toUpperCase();
  const owner = upper.includes("CONFIRMED") && upper.includes("BUDGET") && upper.includes("STLY");
  return !owner && /OTB\s*@/.test(upper) && upper.includes("LAST YEAR");
};

export interface ComparisonPdfOptions {
  /** Report window months, used to order the extract's month list. */
  windowMonths?: string[];
}

export async function parsePriorComparisonPdf(
  buffer: ArrayBuffer,
  options: ComparisonPdfOptions = {},
): Promise<PriorReportExtract> {
  const extract = emptyExtract();
  const pages = await readRows(buffer);

  const blocks: Block[] = [];
  pages.forEach((rows, index) => {
    const page = index + 1;
    // Split the page into stacked blocks; each starts at a header row. The block
    // kind is the label printed immediately above it (the first, unlabelled
    // block is revenue).
    let pending: BlockKind | null = null;
    let current: RowLine[] | null = null;
    let currentKind: BlockKind = "revenue";
    const flush = () => {
      if (!current) return;
      const parsed = parseBlock(current, page, currentKind, extract.warnings);
      if (parsed) blocks.push(parsed);
      current = null;
    };
    for (const row of rows) {
      // Block labels sit in the grid's own left column; the sheet title and
      // chart captions print further right on the same visual line.
      const label = row.cells
        .filter((cell) => cell.x < 320)
        .map((cell) => blockLabel(cell.text))
        .find((kind): kind is BlockKind => kind !== null) ?? null;
      if (label) {
        flush();
        pending = label;
        continue;
      }
      if (isHeaderRow(row) && (!current || current.some((line) => monthKey(line.cells[0]?.text ?? "")))) {
        flush();
        currentKind = pending ?? (blocks.length === 0 ? "revenue" : "unknown");
        pending = null;
        current = [row];
        continue;
      }
      if (current) current.push(row);
    }
    flush();
  });

  const pick = (kind: BlockKind): Block | undefined => blocks.find((block) => block.kind === kind);
  const revenue = pick("revenue");
  const occupancy = pick("occupancy");
  const adr = pick("adr");

  if (!revenue) {
    extract.warnings.push(
      "No revenue comparison grid was found in this PDF — check that it is the consolidated revenue sheet.",
    );
    return extract;
  }

  extract.currentOtbRevenue = revenue.values.current;
  extract.previousOtbRevenue = revenue.values.previous;
  extract.lastYearActual = revenue.values.lastYear;
  if (occupancy) {
    extract.currentOtbOccupancy = occupancy.values.current;
    extract.previousOccupancy = occupancy.values.previous;
    extract.lastYearOccupancy = occupancy.values.lastYear;
  }
  if (adr) {
    extract.currentOtbAdr = adr.values.current;
    extract.previousAdr = adr.values.previous;
    extract.lastYearAdr = adr.values.lastYear;
    extract.currentRoomNights = nightsFromAdr(revenue.values.current, adr.values.current);
    extract.previousRoomNights = nightsFromAdr(revenue.values.previous, adr.values.previous);
    extract.lastYearRoomNights = nightsFromAdr(revenue.values.lastYear, adr.values.lastYear);
  } else {
    extract.warnings.push("No ADR block was found, so room nights could not be derived.");
  }

  // Column headings print over two lines, and the chart legends repeat them in
  // full: whichever reads as a date wins.
  const legend = [...pages.flat().map(rowText).join(" \n").matchAll(/OTB\s*@\s*(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})/g)]
    .map((match) => match[0]);
  const currentLabel = labelDate(revenue.labels.current ?? "")
    ? (revenue.labels.current as string)
    : legend[0] ?? revenue.labels.current ?? null;
  extract.asOfDate = labelDate(currentLabel ?? "");
  extract.otbColumnLabel = labelDate(revenue.labels.previous ?? "")
    ? revenue.labels.previous ?? null
    : legend[1] ?? revenue.labels.previous ?? null;
  extract.baselineSheet = `page ${revenue.page} — printed comparison grid`;

  const found = new Set(Object.keys(extract.currentOtbRevenue));
  for (const key of Object.keys(extract.previousOtbRevenue)) found.add(key);
  const window = options.windowMonths ?? [];
  extract.months = [
    ...window.filter((key) => found.has(key)),
    ...[...found].filter((key) => !window.includes(key)).sort(),
  ];

  extract.sheetsRead = [
    `Revenue grid (page ${revenue.page})`,
    ...(occupancy ? [`Occupancy grid (page ${occupancy.page})`] : []),
    ...(adr ? [`ADR grid (page ${adr.page})`] : []),
  ];
  extract.sheetsSkipped = blocks
    .filter((block) => block.kind === "revpar" || block.kind === "unknown")
    .map((block) => `${block.kind === "revpar" ? "RevPAR" : "Unrecognised"} grid (page ${block.page})`);
  if (currentLabel && !extract.asOfDate) {
    extract.warnings.push(`Could not read an as-of date from the column heading "${currentLabel}".`);
  }
  return extract;
}
