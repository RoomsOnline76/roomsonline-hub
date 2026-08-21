/**
 * Reads a property's *existing* consolidated revenue report workbook — the last
 * pack that was produced (by hand or by an earlier version of this tool) — and
 * lifts out the numbers a brand-new run has no way of knowing:
 *
 *  - the workbook's current "OTB @ <date>" column → the new run's previous-OTB
 *  - "Last Year Actual" (revenue and room nights)
 *  - the reviewer's manual inputs (Dinner, Room 0, Comp RNs)
 *  - the multi-year Historical / Fin Year grids → the property's baseline
 *
 * Detection is entirely heading-driven (never fixed cell addresses) so the
 * NightsBridge and OPERA packs both parse, and legacy ad-hoc workbooks degrade
 * to "nothing found" with a warning instead of importing nonsense.
 */

import * as XLSX from "npm:xlsx@0.18.5";

export interface PriorReportExtract {
  /** As-of date of the workbook's newest OTB column, when it could be read. */
  asOfDate: string | null;
  /** Heading text of the column used as the previous-OTB source. */
  otbColumnLabel: string | null;
  /** Month keys (`YYYY-MM`) found on the OTB sheet, in report order. */
  months: string[];
  previousOtbRevenue: Record<string, number>;
  previousRoomNights: Record<string, number>;
  lastYearActual: Record<string, number>;
  lastYearRoomNights: Record<string, number>;
  dinnerByMonth: Record<string, number>;
  room0ByMonth: Record<string, number>;
  compRnsByMonth: Record<string, number>;
  /** Multi-year grids, keyed `YYYY-MM`. */
  historicalRevenue: Record<string, number>;
  historicalRoomNights: Record<string, number>;
  /** Sheets that produced data, and sheets that were skipped. */
  sheetsRead: string[];
  sheetsSkipped: string[];
  warnings: string[];
}

type Row = unknown[];

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

const lower = (value: unknown): string => text(value).toLowerCase();

/** Tolerant number reader: strips currency, spaces, thousands separators. */
export const toNum = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  if (/#(ref|div|value|n\/a|name)/i.test(raw)) return null;
  const cleaned = raw.replace(/[R$€£\s\u00a0]/g, "").replace(/,/g, "");
  const negative = /^\((.+)\)$/.exec(cleaned);
  const body = negative ? `-${negative[1]}` : cleaned;
  const parsed = Number(body.replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const pad = (n: number): string => `${n}`.padStart(2, "0");

/** Month index 1-12 from "Jul", "Sept", "07", or a real date cell. */
const monthOf = (value: unknown): number | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getUTCMonth() + 1;
  }
  const raw = text(value);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(raw);
  if (iso) return Number(iso[2]);
  const index = MONTHS.indexOf(raw.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : null;
};

const yearOf = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100) {
    return value;
  }
  const raw = text(value);
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= 2000 && year <= 2100 ? year : null;
};

/** "OTB @ 14 Aug 2026" / "OTB @ 20.08.26" → ISO date. */
const parseOtbDate = (heading: string): string | null => {
  const after = heading.replace(/^.*@\s*/i, "").trim();
  const dotted = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/.exec(after);
  if (dotted) {
    const year = Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]);
    return `${year}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`;
  }
  const named = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(after);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month >= 0) return `${named[3]}-${pad(month + 1)}-${pad(Number(named[1]))}`;
  }
  const parsed = new Date(after);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
  }
  return null;
};

const sheetRows = (workbook: XLSX.WorkBook, name: string): Row[] =>
  XLSX.utils.sheet_to_json<Row>(workbook.Sheets[name], {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });

/** First non-empty cell among the leading columns — the row's label. */
const rowLabel = (row: Row): string => {
  for (let col = 0; col < 3; col += 1) {
    const value = text(row?.[col]);
    if (value) return value;
  }
  return "";
};

/* ─────────────────────── OTB RR sheet ─────────────────────── */

interface OtbColumn {
  col: number;
  heading: string;
  date: string | null;
}

type BlockKind = "revenue" | "nights" | "skip";

const blockKind = (label: string): BlockKind => {
  const l = label.toLowerCase();
  if (/adr|average daily rate/.test(l)) return "skip";
  if (/room night|room occupancy|occupancy/.test(l)) return "nights";
  if (/revenue/.test(l) || !l) return "revenue";
  return "revenue";
};

/**
 * Room-night columns and occupancy columns can share the same "OTB @ …"
 * heading (OPERA prints both). Counts are whole numbers well above 1, fractions
 * are occupancy — pick the column that reads like a count.
 */
const looksLikeCounts = (rows: Row[], from: number, to: number, col: number): boolean => {
  let counts = 0;
  let fractions = 0;
  for (let r = from; r < to; r += 1) {
    const value = toNum(rows[r]?.[col]);
    if (value === null || value === 0) continue;
    if (Math.abs(value) < 1.5) fractions += 1;
    else counts += 1;
  }
  return counts > fractions;
};

interface OtbResult {
  asOfDate: string | null;
  label: string | null;
  months: string[];
  revenue: Record<string, number>;
  nights: Record<string, number>;
  lastYearRevenue: Record<string, number>;
  lastYearNights: Record<string, number>;
  dinner: Record<string, number>;
  room0: Record<string, number>;
  compRns: Record<string, number>;
  warnings: string[];
}

function parseOtbSheet(rows: Row[]): OtbResult | null {
  const result: OtbResult = {
    asOfDate: null,
    label: null,
    months: [],
    revenue: {},
    nights: {},
    lastYearRevenue: {},
    lastYearNights: {},
    dinner: {},
    room0: {},
    compRns: {},
    warnings: [],
  };

  // 1. Locate every header row and the OTB columns it carries.
  const headers: { row: number; columns: OtbColumn[] }[] = [];
  rows.forEach((row, index) => {
    const columns: OtbColumn[] = [];
    (row ?? []).forEach((cell, col) => {
      const heading = text(cell);
      if (/otb\s*@/i.test(heading)) {
        columns.push({ col, heading, date: parseOtbDate(heading) });
      }
    });
    if (columns.length) headers.push({ row: index, columns });
  });
  if (!headers.length) return null;

  const dates = headers
    .flatMap((h) => h.columns.map((c) => c.date))
    .filter((d): d is string => Boolean(d))
    .sort();
  result.asOfDate = dates.length ? dates[dates.length - 1] : null;
  result.label = result.asOfDate
    ? (headers
        .flatMap((h) => h.columns)
        .find((c) => c.date === result.asOfDate)?.heading ?? null)
    : headers[0].columns[0].heading;
  if (!result.asOfDate) {
    result.warnings.push("Could not read the as-of date from the OTB column heading.");
  }

  // 2. Walk each block: header row, then month rows until the block ends.
  for (let h = 0; h < headers.length; h += 1) {
    const header = headers[h];
    const end = h + 1 < headers.length ? headers[h + 1].row : rows.length;

    // Section label: this header row's own label, else the nearest label above.
    let label = rowLabel(rows[header.row] ?? []);
    if (/otb\s*@/i.test(label) || !label) {
      for (let r = header.row - 1; r >= 0 && r >= header.row - 3; r -= 1) {
        const candidate = rowLabel(rows[r] ?? []);
        if (candidate && !/otb\s*@/i.test(candidate)) {
          label = candidate;
          break;
        }
      }
    }
    const kind = blockKind(label);
    if (kind === "skip") continue;

    const dataFrom = header.row + 1;
    const isNights = kind === "nights";

    // OTB column for this block — the newest date, count-shaped when nights.
    const candidates = header.columns.filter(
      (c) => !result.asOfDate || c.date === result.asOfDate,
    );
    let otbCol = candidates[0]?.col ?? header.columns[0].col;
    if (isNights && candidates.length > 1) {
      const counted = candidates.find((c) => looksLikeCounts(rows, dataFrom, end, c.col));
      if (counted) otbCol = counted.col;
    }

    // Last-year and manual-input columns on this header row.
    const headerRow = rows[header.row] ?? [];
    const lyCandidates: number[] = [];
    let dinnerCol: number | null = null;
    let room0Col: number | null = null;
    let compCol: number | null = null;
    headerRow.forEach((cell, col) => {
      const heading = lower(cell);
      if (!heading) return;
      if (/last year/.test(heading) && !/vs/.test(heading)) lyCandidates.push(col);
      if (/^rn last year|last year.*(rn|room night)/.test(heading)) lyCandidates.push(col);
      if (/^dinner/.test(heading)) dinnerCol = col;
      if (/room\s*0/.test(heading)) room0Col = col;
      if (/comp\.?\s*(rns?|room nights?)/.test(heading)) compCol = col;
    });
    let lyCol: number | null = lyCandidates.length ? lyCandidates[0] : null;
    if (isNights && lyCandidates.length > 1) {
      const counted = lyCandidates.find((col) => looksLikeCounts(rows, dataFrom, end, col));
      if (counted !== undefined) lyCol = counted;
    }

    // 3. Month rows. Years roll forward from the as-of year.
    const baseYear = result.asOfDate
      ? Number(result.asOfDate.slice(0, 4))
      : new Date().getUTCFullYear();
    let year = baseYear;
    let previousMonth = 0;

    for (let r = dataFrom; r < end; r += 1) {
      const row = rows[r] ?? [];
      const labelCell = row[0];
      const raw = text(labelCell);
      if (/^total/i.test(raw)) break;
      const month = monthOf(labelCell);
      if (month === null) continue;
      if (previousMonth && month < previousMonth) year += 1;
      previousMonth = month;
      const key = `${year}-${pad(month)}`;
      if (!result.months.includes(key)) result.months.push(key);

      const otb = toNum(row[otbCol]);
      const ly = lyCol === null ? null : toNum(row[lyCol]);
      if (isNights) {
        if (otb !== null) result.nights[key] = otb;
        if (ly !== null) result.lastYearNights[key] = ly;
      } else {
        if (otb !== null) result.revenue[key] = otb;
        if (ly !== null) result.lastYearRevenue[key] = ly;
        const dinner = dinnerCol === null ? null : toNum(row[dinnerCol]);
        const room0 = room0Col === null ? null : toNum(row[room0Col]);
        const comp = compCol === null ? null : toNum(row[compCol]);
        if (dinner !== null) result.dinner[key] = dinner;
        if (room0 !== null) result.room0[key] = room0;
        if (comp !== null) result.compRns[key] = comp;
      }
    }
  }

  result.months.sort();
  return result;
}

/* ───────────────── Year grids (Fin Year / Historical) ───────────────── */

interface YearGrid {
  revenue: Record<string, number>;
  roomNights: Record<string, number>;
  rows: number;
}

/**
 * Reads any "years across, months down" grid. A header row is one carrying two
 * or more four-digit year cells; the nearest label above it decides whether the
 * block is revenue or room nights. Repeated year columns (revenue next to
 * occupancy) keep their first occurrence.
 */
function parseYearGrid(rows: Row[]): YearGrid {
  const grid: YearGrid = { revenue: {}, roomNights: {}, rows: 0 };
  let columns: { year: number; col: number }[] = [];
  let mode: "revenue" | "nights" | null = null;
  let lastLabel = "";
  let seenBlock = false;

  rows.forEach((row) => {
    const cells = row ?? [];
    const yearCols: { year: number; col: number }[] = [];
    const seen = new Set<number>();
    cells.forEach((cell, col) => {
      const year = yearOf(cell);
      if (year !== null && !seen.has(year)) {
        seen.add(year);
        yearCols.push({ year, col });
      }
    });
    const label = rowLabel(cells);

    if (yearCols.length >= 2) {
      columns = yearCols;
      const known = /revenue|room night|occupancy|adr|average daily rate|target/i;
      const source = known.test(label) ? label : lastLabel;
      if (/room night/i.test(source)) mode = "nights";
      else if (/revenue/i.test(source)) mode = "revenue";
      else if (known.test(source)) mode = null;
      // An unlabelled first block is the revenue grid; later unlabelled blocks
      // (occupancy, ADR, targets) are ignored rather than guessed at.
      else mode = seenBlock ? null : "revenue";
      seenBlock = true;
      lastLabel = label || lastLabel;
      return;
    }

    if (label) lastLabel = label;
    if (!columns.length || !mode) return;
    if (/^total/i.test(label)) return;
    const month = monthOf(cells[0]) ?? monthOf(cells[1]) ?? monthOf(cells[2]);
    if (month === null) return;

    const target = mode === "nights" ? grid.roomNights : grid.revenue;
    for (const { year, col } of columns) {
      const value = toNum(cells[col]);
      if (value === null) continue;
      target[`${year}-${pad(month)}`] = value;
      grid.rows += 1;
    }
  });

  return grid;
}

/* ─────────────────────────── entry point ─────────────────────────── */

export function parsePriorReportWorkbook(buffer: ArrayBuffer): PriorReportExtract {
  const extract: PriorReportExtract = {
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
    historicalRevenue: {},
    historicalRoomNights: {},
    sheetsRead: [],
    sheetsSkipped: [],
    warnings: [],
  };

  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });

  for (const name of workbook.SheetNames) {
    const key = name.trim().toLowerCase();
    const rows = sheetRows(workbook, name);

    if (/otb/.test(key)) {
      const otb = parseOtbSheet(rows);
      if (!otb || (!Object.keys(otb.revenue).length && !Object.keys(otb.nights).length)) {
        extract.sheetsSkipped.push(name);
        continue;
      }
      extract.sheetsRead.push(name);
      extract.asOfDate = otb.asOfDate;
      extract.otbColumnLabel = otb.label;
      extract.months = otb.months;
      extract.previousOtbRevenue = otb.revenue;
      extract.previousRoomNights = otb.nights;
      extract.lastYearActual = otb.lastYearRevenue;
      extract.lastYearRoomNights = otb.lastYearNights;
      extract.dinnerByMonth = otb.dinner;
      extract.room0ByMonth = otb.room0;
      extract.compRnsByMonth = otb.compRns;
      extract.warnings.push(...otb.warnings);
      continue;
    }

    if (/fin\s*year|historic/.test(key)) {
      const grid = parseYearGrid(rows);
      if (!grid.rows) {
        extract.sheetsSkipped.push(name);
        continue;
      }
      extract.sheetsRead.push(name);
      // Historical wins over Fin Year for a month present in both (it is the
      // longer-running record), so merge Fin Year first, Historical after.
      const revenueTarget = /historic/.test(key)
        ? { ...extract.historicalRevenue, ...grid.revenue }
        : { ...grid.revenue, ...extract.historicalRevenue };
      const nightsTarget = /historic/.test(key)
        ? { ...extract.historicalRoomNights, ...grid.roomNights }
        : { ...grid.roomNights, ...extract.historicalRoomNights };
      extract.historicalRevenue = revenueTarget;
      extract.historicalRoomNights = nightsTarget;
      continue;
    }

    extract.sheetsSkipped.push(name);
  }

  if (!extract.sheetsRead.length) {
    extract.warnings.push(
      "No recognisable OTB, Fin Year or Historical sheet was found — this workbook has to be entered by hand.",
    );
  }
  if (extract.sheetsSkipped.length) {
    extract.warnings.push(`Sheets not read: ${extract.sheetsSkipped.join(", ")}.`);
  }

  return extract;
}
