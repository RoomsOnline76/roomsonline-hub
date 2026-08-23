/**
 * Reads a CheetaPlains-style **owner's report PDF** — the pack the owner already
 * receives — and lifts out the numbers a brand-new run has no way of knowing.
 *
 * Unlike the consolidated Excel packs (see `priorReportWorkbook.ts`) this source
 * is a designed PDF, so extraction is position-aware: text items are grouped
 * into rows by their y coordinate and mapped to columns by clustering x
 * positions against the grid's own header anchors. Nothing is read from fixed
 * page/cell addresses, so a re-skinned pack still parses (or degrades to
 * "nothing found" with a warning) instead of importing nonsense.
 *
 * Pages handled:
 *  - the two financial-year revenue grids (Confirmed BOB, Active Enquiries,
 *    Budget, BOB STLY, LY Actual, and the three occupancy series)
 *  - "Bookings declined due to no availability"
 *  - "Top booking travel partners" (current vs prior FY)
 *  - "Bookings by nationality"
 *
 * The multi-year partner trend pages are charts with no text layer — they are
 * reported as a warning rather than guessed at.
 */

import { getDocumentProxy } from "npm:unpdf@0.12.1";

/* ── Types ─────────────────────────────────────────────────── */

export type NumberMap = Record<string, number>;

/** One financial-year revenue grid, keyed `YYYY-MM` in fiscal order. */
export interface OwnerFiscalYearGrid {
  /** As printed, e.g. `2026/27`. */
  label: string;
  /** Calendar year the fiscal year opens in (March). */
  startYear: number;
  months: string[];
  confirmedBob: NumberMap;
  budget: NumberMap;
  activeEnquiries: NumberMap;
  varianceToBudget: NumberMap;
  bobStly: NumberMap;
  lastYearActual: NumberMap;
  varianceToStly: NumberMap;
  combined: NumberMap;
  occupancyBob: NumberMap;
  occupancyStly: NumberMap;
  occupancyLastYear: NumberMap;
}

export interface DeclinedBookingRow {
  /** `YYYY-MM` when the label could be resolved. */
  month: string | null;
  monthLabel: string;
  value: number;
  agents: string[];
  reason: string;
  /** Share of that month's revenue, 0.24 for "24%". */
  shareOfMonthRevenue: number | null;
}

export interface NationalityRow {
  country: string;
  currentNights: number;
  currentRevenue: number;
  priorNights: number;
  priorRevenue: number;
}

export interface PartnerRow {
  partner: string;
  nights: number;
  revenue: number;
}

/** One prose paragraph group — a bold heading plus its lines. */
export interface OwnerNarrativeBlock {
  heading: string | null;
  lines: string[];
}

/** A commentary page (BOB analysis, distribution & reservations update). */
export interface OwnerNarrative {
  page: number;
  title: string;
  subtitle: string | null;
  blocks: OwnerNarrativeBlock[];
}

/** Multi-year producing-partner table, one column per financial year. */
export interface PartnerTrendTable {
  page: number;
  title: string;
  columns: string[];
  rows: Array<{ partner: string; values: Array<number | null> }>;
}

export interface OwnerReportExtract {
  /** As-of date printed on the grid headers ("as per 31/07/2026"), if found. */
  asOfDate: string | null;
  /** Label of the column used as the comparison baseline. */
  otbColumnLabel: string | null;
  /** Page the baseline grid was read from, for provenance. */
  baselineSheet: string | null;
  months: string[];
  /** Current-year grid (the run's own window). */
  currentYear: OwnerFiscalYearGrid | null;
  /** Next financial year, when the pack carries a forward grid. */
  forwardYear: OwnerFiscalYearGrid | null;
  declined: DeclinedBookingRow[];
  declinedTotal: number | null;
  declinedPeriod: string | null;
  nationality: NationalityRow[];
  nationalityCurrentLabel: string | null;
  nationalityPriorLabel: string | null;
  partnersCurrent: PartnerRow[];
  partnersPrior: PartnerRow[];
  partnersCurrentLabel: string | null;
  partnersPriorLabel: string | null;
  /** Commentary pages, in printed order. */
  narratives: OwnerNarrative[];
  /** Multi-year partner trend tables, when they carry a text layer. */
  partnerTrends: PartnerTrendTable[];
  pagesRead: string[];
  pagesSkipped: string[];
  warnings: string[];
}


/* ── Text extraction ───────────────────────────────────────── */

interface Cell {
  text: string;
  x: number;
  y: number;
}
interface RowLine {
  y: number;
  cells: Cell[];
}
interface Page {
  number: number;
  rows: RowLine[];
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const pad = (value: number): string => `${value}`.padStart(2, "0");

/**
 * Tolerant number reader for print output: strips currency symbols, thin
 * spaces and thousands separators, and repairs the two typo shapes the packs
 * contain — a trailing separator (`281,303,`) and a decimal point standing in
 * for a thousands comma (`539.642`).
 */
export const printedNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed || /^[-–—]+$/.test(trimmed)) return null;
  const percent = /%$/.test(trimmed);
  let body = trimmed
    .replace(/%$/, "")
    .replace(/[R$€£]/gi, "")
    .replace(/[\s\u00a0\u2009]/g, "")
    .replace(/,+$/, "")
    .replace(/\.+$/, "");
  const negative = /^\((.+)\)$/.exec(body);
  if (negative) body = `-${negative[1]}`;
  // `539.642` — three digits after a dot with no other separator is a mis-typed
  // thousands comma, not a fraction.
  if (/^-?\d{1,3}\.\d{3}$/.test(body)) body = body.replace(".", "");
  body = body.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
};

const isNumeric = (cell: Cell): boolean => printedNumber(cell.text) !== null;

/** Groups a page's text items into visual rows (y tolerance in points). */
async function readPages(buffer: ArrayBuffer): Promise<Page[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pages: Page[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const cells: Cell[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const text = (item.str ?? "").trim();
      if (!text || !item.transform) continue;
      cells.push({ text, x: item.transform[4], y: item.transform[5] });
    }
    const buckets: RowLine[] = [];
    for (const cell of cells) {
      const row = buckets.find((candidate) => Math.abs(candidate.y - cell.y) <= 3);
      if (row) row.cells.push(cell);
      else buckets.push({ y: cell.y, cells: [cell] });
    }
    for (const row of buckets) row.cells.sort((a, b) => a.x - b.x);
    buckets.sort((a, b) => b.y - a.y);
    pages.push({ number, rows: buckets });
  }
  return pages;
}

const pageText = (page: Page): string =>
  page.rows.map((row) => row.cells.map((cell) => cell.text).join(" ")).join(" \n");

/** Median of a numeric list — column anchors are noisy, means are not safe. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* ── Financial-year revenue grids ──────────────────────────── */

const FY_COLUMNS = [
  "confirmedBob",
  "budget",
  "activeEnquiries",
  "varianceToBudget",
  "bobStly",
  "lastYearActual",
  "varianceToStly",
  "combined",
  "occupancyBob",
  "occupancyStly",
  "occupancyLastYear",
] as const;

type FyColumn = (typeof FY_COLUMNS)[number];

const emptyGrid = (label: string, startYear: number): OwnerFiscalYearGrid => ({
  label,
  startYear,
  months: [],
  confirmedBob: {},
  budget: {},
  activeEnquiries: {},
  varianceToBudget: {},
  bobStly: {},
  lastYearActual: {},
  varianceToStly: {},
  combined: {},
  occupancyBob: {},
  occupancyStly: {},
  occupancyLastYear: {},
});

const isFyGridPage = (page: Page): boolean => {
  const text = pageText(page).toUpperCase();
  return (
    text.includes("CONFIRMED") &&
    text.includes("BUDGET") &&
    (text.includes("BOB STLY") || text.includes("STLY")) &&
    text.includes("OCCUPANCY")
  );
};

/** `2026/27`, `2026/2027` → 2026. */
const fyStartYear = (label: string): number | null => {
  const match = /(20\d{2})\s*\/\s*(\d{2,4})/.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? year : null;
};

const fyLabelOf = (page: Page): { label: string; startYear: number } | null => {
  for (const row of page.rows) {
    for (const cell of row.cells) {
      const year = fyStartYear(cell.text);
      if (year !== null) return { label: cell.text.trim(), startYear: year };
    }
  }
  return null;
};

/** Month index from `Mar-26`, `Mar 26`, `March`. */
const monthLabelIndex = (raw: string): number | null => {
  const match = /^([A-Za-z]{3,9})\s*[-\/ ]?\s*(\d{2,4})?$/.exec(raw.trim());
  if (!match) return null;
  const index = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : null;
};

/**
 * Fiscal-year key: the grid runs March → February, so January and February
 * belong to `startYear + 1`. The printed label's own year is *not* trusted —
 * the packs contain roll-over typos (`Jan-29` in a 2027/28 grid).
 */
const fiscalKey = (monthIndex: number, startYear: number): string => {
  const year = monthIndex <= 2 ? startYear + 1 : startYear;
  return `${year}-${pad(monthIndex)}`;
};

/** `as per 31/07/2026` → `2026-07-31`. */
const asOfFromText = (text: string): string | null => {
  const match = /as\s+per\s+(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/i.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
};

function parseFyGrid(page: Page, warnings: string[]): OwnerFiscalYearGrid | null {
  const header = fyLabelOf(page);
  if (!header) {
    warnings.push(`Page ${page.number} looks like a revenue grid but has no financial-year heading.`);
    return null;
  }
  const grid = emptyGrid(header.label, header.startYear);

  interface MonthRow {
    monthIndex: number;
    label: string;
    numerics: Cell[];
  }
  const monthRows: MonthRow[] = [];
  for (const row of page.rows) {
    // The month label sits left of the numbers; side notes bleed in below x≈90.
    const labelCell = row.cells.find((cell) => cell.x >= 90 && monthLabelIndex(cell.text) !== null);
    if (!labelCell) continue;
    const numerics = row.cells.filter((cell) => cell.x > labelCell.x && isNumeric(cell));
    if (numerics.length < 6) continue;
    monthRows.push({
      monthIndex: monthLabelIndex(labelCell.text)!,
      label: labelCell.text,
      numerics,
    });
  }
  if (!monthRows.length) return null;

  // Column anchors come from the rows that printed every column; partial rows
  // are then matched to the nearest anchor.
  const complete = monthRows.filter((row) => row.numerics.length === FY_COLUMNS.length);
  if (!complete.length) {
    warnings.push(
      `Page ${page.number}: no month row printed all ${FY_COLUMNS.length} columns, so the grid was skipped.`,
    );
    return null;
  }
  const anchors = FY_COLUMNS.map((_, index) =>
    median(complete.map((row) => row.numerics[index].x)),
  );

  for (const row of monthRows) {
    const key = fiscalKey(row.monthIndex, grid.startYear);
    if (!grid.months.includes(key)) grid.months.push(key);
    const assign = (column: FyColumn, cell: Cell | undefined) => {
      if (!cell) return;
      const value = printedNumber(cell.text);
      if (value === null) return;
      grid[column][key] = value;
    };
    if (row.numerics.length === FY_COLUMNS.length) {
      FY_COLUMNS.forEach((column, index) => assign(column, row.numerics[index]));
      continue;
    }
    const taken = new Set<number>();
    for (const cell of row.numerics) {
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
      // Print columns sit ~45pt apart; anything further out is not a column hit.
      if (best < 0 || bestDistance > 45) continue;
      taken.add(best);
      assign(FY_COLUMNS[best], cell);
    }
  }

  grid.months.sort();
  return grid;
}

/* ── Declined bookings ─────────────────────────────────────── */

function parseDeclined(
  page: Page,
): { rows: DeclinedBookingRow[]; total: number | null; period: string | null } {
  const rows: DeclinedBookingRow[] = [];
  let total: number | null = null;
  const text = pageText(page);
  const periodMatch =
    /(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[–-]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(text);
  const period = periodMatch ? `${periodMatch[1]} – ${periodMatch[2]}` : null;

  // Column anchors from the header row.
  const headerRow = page.rows.find((row) =>
    row.cells.some((cell) => /AGENT/i.test(cell.text)) &&
    row.cells.some((cell) => /MONTH/i.test(cell.text)),
  );
  const agentAnchor = headerRow?.cells.find((cell) => /AGENT/i.test(cell.text))?.x ?? 344;
  const reasonAnchor = headerRow?.cells.find((cell) => /REASON/i.test(cell.text))?.x ?? 583;

  for (const row of page.rows) {
    const cells = row.cells.filter((cell) => cell.x >= 95);
    if (!cells.length) continue;
    const first = cells[0];
    const monthIndex = monthLabelIndex(first.text);
    const isTotal = /^total$/i.test(first.text);

    if (monthIndex === null && !isTotal) {
      // Continuation line: extra agents for the month above.
      if (!rows.length) continue;
      const agents = cells
        .filter((cell) => !isNumeric(cell) && cell.x < reasonAnchor - 40)
        .map((cell) => cell.text);
      rows[rows.length - 1].agents.push(...agents);
      continue;
    }

    const valueCell = cells.find((cell) => cell.x > first.x && isNumeric(cell));
    const value = valueCell ? printedNumber(valueCell.text) : null;
    if (isTotal) {
      total = value;
      continue;
    }
    if (value === null) continue;

    const rest = cells.filter((cell) => cell !== first && cell !== valueCell);
    const agents = rest
      .filter((cell) => !isNumeric(cell) && cell.x >= agentAnchor - 110 && cell.x < reasonAnchor - 40)
      .map((cell) => cell.text);
    const reason = rest
      .filter((cell) => !isNumeric(cell) && cell.x >= reasonAnchor - 40)
      .map((cell) => cell.text)
      .join(" ");
    const shareCell = rest.filter(isNumeric).find((cell) => /%/.test(cell.text));

    const yearMatch = /(\d{2,4})\s*$/.exec(first.text);
    const year = yearMatch
      ? Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1])
      : null;

    rows.push({
      month: year ? `${year}-${pad(monthIndex)}` : null,
      monthLabel: first.text,
      value,
      agents,
      reason,
      shareOfMonthRevenue: shareCell ? printedNumber(shareCell.text) : null,
    });
  }

  return { rows, total, period };
}

/* ── Nationality ───────────────────────────────────────────── */

function parseNationality(page: Page): {
  rows: NationalityRow[];
  currentLabel: string | null;
  priorLabel: string | null;
} {
  const anchors: number[] = [];
  const labels: string[] = [];
  for (const row of page.rows) {
    for (const cell of row.cells) {
      if (/TOTAL (VILLA NIGHTS|REVENUE)/i.test(cell.text)) anchors.push(cell.x);
      const year = /(20\d{2}\s*\/\s*\d{1,4})/.exec(cell.text);
      if (year && !labels.includes(year[1])) labels.push(year[1]);
    }
  }
  anchors.sort((a, b) => a - b);
  if (anchors.length < 4) return { rows: [], currentLabel: null, priorLabel: null };

  // Year labels can print beside the nights column rather than in the heading.
  const yearLabels = labels.length >= 2 ? labels : [];

  const rows: NationalityRow[] = [];
  for (const row of page.rows) {
    // Side notes ("By revenue", "Villa nights include…") live left of x≈140.
    const cells = row.cells.filter((cell) => cell.x >= 140);
    const numerics = cells.filter(isNumeric);
    const names = cells.filter((cell) => !isNumeric(cell));
    if (numerics.length !== 4 || names.length !== 1) continue;
    if (/TOTAL|COUNTRY|NATIONALITY/i.test(names[0].text)) continue;
    const [currentNights, currentRevenue, priorNights, priorRevenue] = numerics.map(
      (cell) => printedNumber(cell.text) ?? 0,
    );
    rows.push({
      country: names[0].text,
      currentNights,
      currentRevenue,
      priorNights,
      priorRevenue,
    });
  }

  return {
    rows,
    currentLabel: yearLabels[0] ?? null,
    priorLabel: yearLabels[1] ?? null,
  };
}

/* ── Travel partners ───────────────────────────────────────── */

function parsePartners(page: Page): {
  current: PartnerRow[];
  prior: PartnerRow[];
  currentLabel: string | null;
  priorLabel: string | null;
} {
  const headerRow = page.rows.find(
    (row) =>
      row.cells.filter((cell) => /AGENCY/i.test(cell.text)).length >= 2 &&
      row.cells.some((cell) => /RNS/i.test(cell.text)),
  );
  if (!headerRow) return { current: [], prior: [], currentLabel: null, priorLabel: null };

  const agencyCells = headerRow.cells.filter((cell) => /AGENCY/i.test(cell.text));
  const revenueCells = headerRow.cells.filter((cell) => /REVENUE/i.test(cell.text));
  const nightsCells = headerRow.cells.filter((cell) => /RNS/i.test(cell.text));
  if (agencyCells.length < 2 || revenueCells.length < 2 || nightsCells.length < 2) {
    return { current: [], prior: [], currentLabel: null, priorLabel: null };
  }
  const yearOf = (text: string): string | null => {
    const match = /(20\d{2}\s*\/\s*\d{1,4})/.exec(text);
    return match ? match[1] : null;
  };
  // Everything left of the prior-year agency column belongs to the current year.
  const split = agencyCells[1].x - 40;
  const priorSplit = split;

  const current: PartnerRow[] = [];
  const prior: PartnerRow[] = [];
  for (const row of page.rows) {
    const cells = row.cells.filter((cell) => cell.x >= 100);
    const numerics = cells.filter(isNumeric);
    const names = cells.filter((cell) => !isNumeric(cell));
    if (!numerics.length || !names.length) continue;
    if (names.some((cell) => /AGENCY|RNS|REVENUE/i.test(cell.text))) continue;

    const left = {
      name: names.find((cell) => cell.x < priorSplit),
      numerics: numerics.filter((cell) => cell.x < split),
    };
    const right = {
      name: names.find((cell) => cell.x >= priorSplit),
      numerics: numerics.filter((cell) => cell.x >= split),
    };
    if (left.name && left.numerics.length >= 2) {
      current.push({
        partner: left.name.text,
        nights: printedNumber(left.numerics[0].text) ?? 0,
        revenue: printedNumber(left.numerics[1].text) ?? 0,
      });
    }
    if (right.name && right.numerics.length >= 2) {
      prior.push({
        partner: right.name.text,
        nights: printedNumber(right.numerics[0].text) ?? 0,
        revenue: printedNumber(right.numerics[1].text) ?? 0,
      });
    }
  }

  return {
    current,
    prior,
    currentLabel: yearOf(agencyCells[0].text) ?? yearOf(revenueCells[0].text),
    priorLabel: yearOf(agencyCells[1].text) ?? yearOf(revenueCells[1].text),
  };
}

/* ── Commentary pages ──────────────────────────────────────── */

/** Rows whose text reads as prose rather than as table cells. */
const proseLines = (page: Page): string[] =>
  page.rows
    .map((row) => row.cells.map((cell) => cell.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

/**
 * True when a page is commentary: mostly long sentences and no numeric
 * column structure. Table pages are claimed by their own parsers first.
 */
const isNarrativePage = (page: Page): boolean => {
  const lines = proseLines(page);
  if (lines.length < 4) return false;
  const sentences = lines.filter((line) => line.length >= 60).length;
  return sentences >= 3;
};

/** A short line that does not close a sentence is a bold sub-heading. */
const looksLikeHeading = (line: string): boolean =>
  line.length <= 80 && !/[.:;]$/.test(line) && /[A-Za-z]/.test(line);

function parseNarrative(page: Page): OwnerNarrative | null {
  const lines = proseLines(page);
  if (!lines.length) return null;

  const title = lines[0];
  let index = 1;
  let subtitle: string | null = null;
  if (lines[1] && lines[1].length <= 60 && lines[1] === lines[1].toUpperCase()) {
    subtitle = lines[1];
    index = 2;
  }

  const blocks: OwnerNarrativeBlock[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (looksLikeHeading(line) && line.length <= 70) {
      blocks.push({ heading: line, lines: [] });
      continue;
    }
    if (!blocks.length) blocks.push({ heading: null, lines: [] });
    blocks[blocks.length - 1].lines.push(line);
  }

  const kept = blocks.filter((block) => block.heading || block.lines.length);
  return kept.length ? { page: page.number, title, subtitle, blocks: kept } : null;
}

/* ── Multi-year partner trends ─────────────────────────────── */

/** `2023`, `2023/4`, `FY2026` → the printed heading, else null. */
const yearHeading = (text: string): string | null => {
  const trimmed = text.trim();
  return /^(FY\s*)?20\d{2}(\s*\/\s*\d{1,4})?$/i.test(trimmed) ? trimmed : null;
};

function parsePartnerTrend(page: Page): PartnerTrendTable | null {
  let header: RowLine | null = null;
  let columns: Array<{ label: string; x: number }> = [];
  for (const row of page.rows) {
    const years = row.cells
      .map((cell) => ({ label: yearHeading(cell.text), x: cell.x }))
      .filter((entry): entry is { label: string; x: number } => entry.label !== null);
    if (years.length >= 2 && years.length > columns.length) {
      header = row;
      columns = years;
    }
  }
  if (!header || columns.length < 2) return null;

  const titleRow = page.rows.find(
    (row) => row.y > header!.y && row.cells.length <= 4 && row.cells[0].text.length >= 6,
  );
  const rows: PartnerTrendTable["rows"] = [];
  for (const row of page.rows) {
    if (row === header) continue;
    const cells = row.cells.filter((cell) => cell.x >= 40);
    const name = cells.find((cell) => !isNumeric(cell) && cell.x < columns[0].x - 20);
    const numerics = cells.filter(isNumeric);
    if (!name || numerics.length < 2) continue;
    if (yearHeading(name.text)) continue;
    const values = columns.map((column) => {
      const hit = numerics.find((cell) => Math.abs(cell.x - column.x) <= 45);
      return hit ? printedNumber(hit.text) : null;
    });
    if (values.every((value) => value === null)) continue;
    rows.push({ partner: name.text, values });
  }
  if (!rows.length) return null;

  return {
    page: page.number,
    title: (titleRow?.cells.map((cell) => cell.text).join(" ") ?? "Top producing partners").trim(),
    columns: columns.map((column) => column.label),
    rows,
  };
}

/* ── Entry point ───────────────────────────────────────────── */


export interface OwnerReportOptions {
  /** The run's own as-of date — decides which grid is "current". */
  runAsOfDate?: string | null;
  /** Month keys the run reports on; used to pick the current-year grid. */
  windowMonths?: string[];
}

export async function parsePriorOwnerReport(
  buffer: ArrayBuffer,
  options: OwnerReportOptions = {},
): Promise<OwnerReportExtract> {
  const warnings: string[] = [];
  const pagesRead: string[] = [];
  const pagesSkipped: string[] = [];
  const pages = await readPages(buffer);

  const grids: Array<{ page: number; grid: OwnerFiscalYearGrid }> = [];
  let declined: DeclinedBookingRow[] = [];
  let declinedTotal: number | null = null;
  let declinedPeriod: string | null = null;
  let nationality: NationalityRow[] = [];
  let nationalityCurrentLabel: string | null = null;
  let nationalityPriorLabel: string | null = null;
  let partnersCurrent: PartnerRow[] = [];
  let partnersPrior: PartnerRow[] = [];
  let partnersCurrentLabel: string | null = null;
  let partnersPriorLabel: string | null = null;
  const narratives: OwnerNarrative[] = [];
  const partnerTrends: PartnerTrendTable[] = [];
  let asOfDate: string | null = null;


  for (const page of pages) {
    const text = pageText(page);
    const upper = text.toUpperCase();
    asOfDate = asOfDate ?? asOfFromText(text);

    if (isFyGridPage(page)) {
      const grid = parseFyGrid(page, warnings);
      if (grid && grid.months.length) {
        grids.push({ page: page.number, grid });
        pagesRead.push(`p${page.number} revenue grid ${grid.label}`);
      } else {
        pagesSkipped.push(`p${page.number} revenue grid (unreadable)`);
      }
      continue;
    }

    // "DECLINED" also appears in narrative prose — require the table's own
    // heading plus its agent column before treating the page as the grid.
    if (upper.includes("BOOKINGS DECLINED") && /AGENT/i.test(upper)) {
      const parsed = parseDeclined(page);
      if (parsed.rows.length) {
        declined = parsed.rows;
        declinedTotal = parsed.total;
        declinedPeriod = parsed.period;
        pagesRead.push(`p${page.number} declined bookings`);
      } else {
        pagesSkipped.push(`p${page.number} declined bookings (no rows)`);
      }
      continue;
    }

    if (upper.includes("AGENCY") && upper.includes("RNS")) {
      const parsed = parsePartners(page);
      if (parsed.current.length) {
        partnersCurrent = parsed.current;
        partnersPrior = parsed.prior;
        partnersCurrentLabel = parsed.currentLabel;
        partnersPriorLabel = parsed.priorLabel;
        pagesRead.push(`p${page.number} travel partners`);
      } else {
        pagesSkipped.push(`p${page.number} travel partners (no rows)`);
      }
      continue;
    }

    if (upper.includes("NATIONALITY") || upper.includes("TOTAL VILLA NIGHTS")) {
      const parsed = parseNationality(page);
      if (parsed.rows.length) {
        nationality = parsed.rows;
        nationalityCurrentLabel = parsed.currentLabel;
        nationalityPriorLabel = parsed.priorLabel;
        pagesRead.push(`p${page.number} nationality mix`);
      } else {
        pagesSkipped.push(`p${page.number} nationality mix (no rows)`);
      }
      continue;
    }

    if (/TREND/i.test(upper) && page.rows.length < 40) {
      pagesSkipped.push(`p${page.number} multi-year trend chart (image only)`);
      continue;
    }
    pagesSkipped.push(`p${page.number}`);
  }

  if (!grids.length) {
    warnings.push(
      "No financial-year revenue grid could be read from this PDF — check it is the owner's report pack.",
    );
  }
  if (pagesSkipped.some((entry) => entry.includes("trend chart"))) {
    warnings.push(
      "The multi-year partner trend pages are charts without a text layer, so their figures were not imported.",
    );
  }

  // The grid whose months overlap the run's window is the current year; the
  // other (later) grid is the forward year.
  const window = new Set(options.windowMonths ?? []);
  const overlap = (grid: OwnerFiscalYearGrid): number =>
    window.size ? grid.months.filter((month) => window.has(month)).length : 0;
  const sorted = [...grids].sort((a, b) => {
    const byOverlap = overlap(b.grid) - overlap(a.grid);
    if (byOverlap !== 0) return byOverlap;
    return a.grid.startYear - b.grid.startYear;
  });
  const currentEntry = sorted[0] ?? null;
  const forwardEntry =
    sorted
      .slice(1)
      .sort((a, b) => a.grid.startYear - b.grid.startYear)
      .find((entry) => entry.grid.startYear !== currentEntry?.grid.startYear) ?? null;

  return {
    asOfDate: asOfDate ?? (options.runAsOfDate ?? null),
    otbColumnLabel: currentEntry
      ? `Confirmed BOB ${currentEntry.grid.label}${asOfDate ? ` @ ${asOfDate}` : ""}`
      : null,
    baselineSheet: currentEntry ? `Revenue report ${currentEntry.grid.label} (p${currentEntry.page})` : null,
    months: currentEntry?.grid.months ?? [],
    currentYear: currentEntry?.grid ?? null,
    forwardYear: forwardEntry?.grid ?? null,
    declined,
    declinedTotal,
    declinedPeriod,
    nationality,
    nationalityCurrentLabel,
    nationalityPriorLabel,
    partnersCurrent,
    partnersPrior,
    partnersCurrentLabel,
    partnersPriorLabel,
    pagesRead,
    pagesSkipped,
    warnings,
  };
}
