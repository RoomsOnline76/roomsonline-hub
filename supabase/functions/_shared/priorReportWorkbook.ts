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
  /** Occupancy read as occupancy — never folded into a room-night map. */
  previousOccupancy: Record<string, number>;
  lastYearOccupancy: Record<string, number>;
  /** Target column values, and the uplift its formula was built on (0.1 = +10%). */
  targets: Record<string, number>;
  targetUplift: number | null;
  /** Multi-year grids, keyed `YYYY-MM`. */
  historicalRevenue: Record<string, number>;
  historicalRoomNights: Record<string, number>;
  historicalOccupancy: Record<string, number>;
  /** Sheets kept verbatim for the next workbook (Online Res, Web Comparison). */
  carryForward: Record<string, Array<Array<string | number | null>>>;
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


/**
 * "OTB @ 20 Aug 2026" (NightsBridge/OPERA) and "as @ 15 July 2014" /
 * "On the books @ …" (PROTEL) all mark the same thing: a dated column.
 */
const OTB_HEADING = /(otb|as|on the books|as at)\s*@/i;

/** Sheets kept verbatim so the revenue team never retypes them. */
export const CARRY_FORWARD_SHEETS = ["Online Res", "Web Comparison"];

/** Reads a cell's formula (xlsx keeps it on `.f`), for target-uplift recovery. */
const formulaReader = (workbook: XLSX.WorkBook, name: string) =>
(row: number, col: number): string | null => {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[address] as { f?: string } | undefined;
  return cell?.f ? `=${cell.f}` : null;
};

/** Trims a raw sheet to its populated bounds, dates flattened to ISO days. */
const carryForwardGrid = (rows: Row[]): Array<Array<string | number | null>> => {
  const cell = (value: unknown): string | number | null => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    return text(value) || null;
  };
  const grid = rows.map((row) => (row ?? []).map(cell));
  let lastRow = -1;
  let width = 0;
  grid.forEach((row, index) => {
    const populated = row.reduce<number>(
      (max, value, col) => (value !== null ? col + 1 : max),
      0,
    );
    if (populated > 0) {
      lastRow = index;
      width = Math.max(width, populated);
    }
  });
  if (lastRow < 0 || width === 0) return [];
  return grid.slice(0, lastRow + 1).map((row) => row.slice(0, width));
};

/* ─────────────────────── OTB RR sheet ─────────────────────── */


interface OtbColumn {
  col: number;
  heading: string;
  date: string | null;
}

type BlockKind = "revenue" | "nights" | "occupancy" | "skip";

const blockKind = (label: string): BlockKind => {
  const l = label.toLowerCase();
  if (/adr|avr|average daily rate/.test(l)) return "skip";
  // An occupancy block prints percentages, not counts — never treat it as room
  // nights, or fractions land in the nights maps and blow ADR up to millions.
  if (/room night/.test(l)) return "nights";
  if (/occupancy|occ\s*%/.test(l)) return "occupancy";
  if (/revenue/.test(l) || !l) return "revenue";
  return "revenue";
};

/** Room nights are counts: a fraction is an occupancy value in disguise. */
const plausibleNights = (value: number): boolean => Number.isFinite(value) && value >= 1;

/**
 * Occupancy arrives either as a fraction (0.78) or as a percentage (78, PROTEL
 * multiplies by 100). Anything outside 0–150% is not an occupancy value.
 */
const occupancyOf = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const fraction = value > 1.5 ? value / 100 : value;
  return fraction >= 0 && fraction <= 1.5 ? fraction : null;
};

/** Uplift behind a target formula: "=(E3*1.175)" → 0.175. */
const upliftOfFormula = (formula: string | null): number | null => {
  if (!formula) return null;
  const match = /\*\s*([0-9]*\.?[0-9]+)/.exec(formula.replace(/\s/g, ""));
  if (!match) return null;
  const factor = Number(match[1]);
  if (!Number.isFinite(factor) || factor <= 1 || factor > 2) return null;
  return Math.round((factor - 1) * 10000) / 10000;
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
  occupancy: Record<string, number>;
  lastYearOccupancy: Record<string, number>;
  targets: Record<string, number>;
  targetUplift: number | null;
  dinner: Record<string, number>;
  room0: Record<string, number>;
  compRns: Record<string, number>;
  warnings: string[];
}

type FormulaAt = (row: number, col: number) => string | null;

function parseOtbSheet(
  rows: Row[],
  runAsOfDate?: string | null,
  formulaAt: FormulaAt = () => null,
): OtbResult | null {
  const result: OtbResult = {
    asOfDate: null,
    label: null,
    months: [],
    revenue: {},
    nights: {},
    lastYearRevenue: {},
    lastYearNights: {},
    occupancy: {},
    lastYearOccupancy: {},
    targets: {},
    targetUplift: null,
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
      if (OTB_HEADING.test(heading)) {
        columns.push({ col, heading, date: parseOtbDate(heading) });
      }
    });
    if (columns.length) headers.push({ row: index, columns });
  });
  if (!headers.length) return null;

  const dates = [
    ...new Set(
      headers
        .flatMap((h) => h.columns.map((c) => c.date))
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();

  // The workbook usually carries several OTB columns. What this run needs is a
  // *comparison* baseline, so pick the newest column strictly older than the
  // run's own as-of date; only fall back to the newest when nothing is older.
  const runDate = runAsOfDate ? runAsOfDate.slice(0, 10) : null;
  const older = runDate ? dates.filter((d) => d < runDate) : [];
  result.asOfDate = older.length
    ? older[older.length - 1]
    : dates.length
      ? dates[dates.length - 1]
      : null;
  result.label = result.asOfDate
    ? (headers
        .flatMap((h) => h.columns)
        .find((c) => c.date === result.asOfDate)?.heading ?? null)
    : headers[0].columns[0].heading;
  if (!result.asOfDate) {
    result.warnings.push("Could not read the as-of date from the OTB column heading.");
  } else if (runDate && !older.length && result.asOfDate >= runDate) {
    result.warnings.push(
      `The workbook's only OTB column (${result.asOfDate}) is not older than this run — variances will read as zero.`,
    );
  }


  // 2. Walk each block: header row, then month rows until the block ends.
  for (let h = 0; h < headers.length; h += 1) {
    const header = headers[h];
    const end = h + 1 < headers.length ? headers[h + 1].row : rows.length;

    // Section label: this header row's own label, else the nearest label above.
    let label = rowLabel(rows[header.row] ?? []);
    if (OTB_HEADING.test(label) || !label) {
      for (let r = header.row - 1; r >= 0 && r >= header.row - 3; r -= 1) {
        const candidate = rowLabel(rows[r] ?? []);
        if (candidate && !OTB_HEADING.test(candidate)) {
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
    let targetCol: number | null = null;
    let room0Col: number | null = null;
    let compCol: number | null = null;
    headerRow.forEach((cell, col) => {
      const heading = lower(cell);
      if (!heading) return;
      if (/last year/.test(heading) && !/vs/.test(heading)) lyCandidates.push(col);
      if (/^rn last year|last year.*(rn|room night)/.test(heading)) lyCandidates.push(col);
      if (/target/.test(heading) && !/vs|vrs/.test(heading)) targetCol = col;
      if (/^dinner/.test(heading)) dinnerCol = col;
      if (/room\s*0/.test(heading)) room0Col = col;
      if (/comp\.?\s*(rns?|room nights?)/.test(heading)) compCol = col;
    });
    let lyCol: number | null = lyCandidates.length ? lyCandidates[0] : null;
    if (isNights && lyCandidates.length > 1) {
      const counted = lyCandidates.find((col) => looksLikeCounts(rows, dataFrom, end, col));
      if (counted !== undefined) lyCol = counted;
    }

    // An occupancy block prints percentages beside their room-night counts
    // (OPERA). Split the two so the counts land in the nights maps rather than
    // being discarded, and the percentages never pollute them.
    let occNightsCol: number | null = null;
    let occLyNightsCol: number | null = null;
    if (kind === "occupancy") {
      const isFraction = (col: number) => !looksLikeCounts(rows, dataFrom, end, col);
      const otbFraction = candidates.find((c) => isFraction(c.col));
      if (otbFraction) otbCol = otbFraction.col;
      occNightsCol = candidates.find((c) => !isFraction(c.col))?.col ?? null;
      const lyFraction = lyCandidates.find(isFraction);
      if (lyFraction !== undefined) lyCol = lyFraction;
      occLyNightsCol = lyCandidates.find((col) => !isFraction(col)) ?? null;
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

      if (targetCol !== null) {
        const target = toNum(row[targetCol]);
        if (target !== null && kind === "revenue") result.targets[key] = target;
        const uplift = upliftOfFormula(formulaAt(r, targetCol));
        if (uplift !== null && result.targetUplift === null) result.targetUplift = uplift;
      }

      if (kind === "occupancy") {
        const current = occupancyOf(otb);
        const lastYear = occupancyOf(ly);
        if (current !== null) result.occupancy[key] = current;
        if (lastYear !== null) result.lastYearOccupancy[key] = lastYear;
        const nights = occNightsCol === null ? null : toNum(row[occNightsCol]);
        const lyNights = occLyNightsCol === null ? null : toNum(row[occLyNightsCol]);
        if (nights !== null && plausibleNights(nights) && result.nights[key] === undefined) {
          result.nights[key] = nights;
        }
        if (
          lyNights !== null &&
          plausibleNights(lyNights) &&
          result.lastYearNights[key] === undefined
        ) {
          result.lastYearNights[key] = lyNights;
        }
        continue;
      }

      if (isNights) {
        if (otb !== null && plausibleNights(otb)) result.nights[key] = otb;
        if (ly !== null && plausibleNights(ly)) result.lastYearNights[key] = ly;

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
  occupancy: Record<string, number>;
  rows: number;
}

/**
 * Reads any "years across, months down" grid. A header row is one carrying two
 * or more four-digit year cells; the nearest label above it decides whether the
 * block is revenue or room nights. Repeated year columns (revenue next to
 * occupancy) keep their first occurrence.
 */
function parseYearGrid(rows: Row[]): YearGrid {
  const grid: YearGrid = { revenue: {}, roomNights: {}, occupancy: {}, rows: 0 };
  let columns: { year: number; col: number }[] = [];
  let mode: "revenue" | "nights" | "occupancy" | null = null;
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
      else if (/occupancy|occ\s*%/i.test(source)) mode = "occupancy";
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

    const target =
      mode === "nights" ? grid.roomNights : mode === "occupancy" ? grid.occupancy : grid.revenue;
    for (const { year, col } of columns) {
      const raw = toNum(cells[col]);
      if (raw === null) continue;
      const value = mode === "occupancy" ? occupancyOf(raw) : raw;
      if (value === null) continue;
      if (mode === "nights" && !plausibleNights(value)) continue;
      target[`${year}-${pad(month)}`] = value;
      grid.rows += 1;
    }
  });

  return grid;
}

/* ─────────────────────────── entry point ─────────────────────────── */

export function parsePriorReportWorkbook(
  buffer: ArrayBuffer,
  options: { runAsOfDate?: string | null } = {},
): PriorReportExtract {

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
    previousOccupancy: {},
    lastYearOccupancy: {},
    targets: {},
    targetUplift: null,
    historicalRevenue: {},
    historicalRoomNights: {},
    historicalOccupancy: {},
    carryForward: {},
    sheetsRead: [],
    sheetsSkipped: [],
    warnings: [],
  };

  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellDates: true,
    cellFormula: true,
  });
  const otbSheets: Array<{ name: string; otb: OtbResult }> = [];

  for (const name of workbook.SheetNames) {
    const key = name.trim().toLowerCase();
    const rows = sheetRows(workbook, name);

    // Sheets the revenue team keeps by hand travel forward untouched.
    if (CARRY_FORWARD_SHEETS.some((sheet) => sheet.toLowerCase() === key)) {
      const grid = carryForwardGrid(rows);
      if (grid.length) {
        const canonical =
          CARRY_FORWARD_SHEETS.find((sheet) => sheet.toLowerCase() === key) ?? name;
        extract.carryForward[canonical] = grid;
        extract.sheetsRead.push(name);
      } else {
        extract.sheetsSkipped.push(name);
      }
      continue;
    }

    if (/fin\s*year|historic|stats/.test(key)) {
      const grid = parseYearGrid(rows);
      if (!grid.rows) {
        extract.sheetsSkipped.push(name);
        continue;
      }
      extract.sheetsRead.push(name);
      // Historical wins over Fin Year for a month present in both (it is the
      // longer-running record), so merge Fin Year first, Historical after.
      const longRunning = /historic|stats/.test(key);
      const merge = (
        existing: Record<string, number>,
        incoming: Record<string, number>,
      ): Record<string, number> =>
        longRunning ? { ...existing, ...incoming } : { ...incoming, ...existing };
      extract.historicalRevenue = merge(extract.historicalRevenue, grid.revenue);
      extract.historicalRoomNights = merge(extract.historicalRoomNights, grid.roomNights);
      extract.historicalOccupancy = merge(extract.historicalOccupancy, grid.occupancy);
      continue;
    }

    // Any other sheet may be the OTB grid: PROTEL names it after the hotel
    // ("VA", "Studio Revenue", "Sheet1") and heads its columns "as @ <date>".
    const otb = parseOtbSheet(rows, options.runAsOfDate ?? null, formulaReader(workbook, name));
    const usable =
      otb &&
      (Object.keys(otb.revenue).length ||
        Object.keys(otb.nights).length ||
        Object.keys(otb.occupancy).length);
    if (!usable || !otb) {
      extract.sheetsSkipped.push(name);
      continue;
    }
    otbSheets.push({ name, otb });
  }

  // A legacy workbook holds several vintages of the same grid (the PROTEL
  // archive carries a decade of them). The vintage closest to — but not after —
  // the run's as-of date is the truthful baseline; later vintages and undated
  // sheets only fill gaps behind it.
  const runDate = options.runAsOfDate ?? null;
  const rank = (asOfDate: string | null): [number, number] => {
    if (!asOfDate) return [2, 0];
    const days = Date.parse(`${asOfDate}T00:00:00Z`);
    if (!Number.isFinite(days)) return [2, 0];
    const runDays = runDate ? Date.parse(`${runDate}T00:00:00Z`) : NaN;
    if (Number.isFinite(runDays) && days > runDays) return [1, -days];
    return [0, -days];
  };
  otbSheets.sort((a, b) => {
    const [groupA, orderA] = rank(a.otb.asOfDate);
    const [groupB, orderB] = rank(b.otb.asOfDate);
    return groupA - groupB || orderA - orderB;
  });

  const fill = (target: Record<string, number>, source: Record<string, number>) => {
    for (const [month, value] of Object.entries(source)) {
      if (target[month] === undefined) target[month] = value;
    }
  };

  otbSheets.forEach(({ name, otb }, index) => {
    extract.sheetsRead.push(name);
    if (index === 0) {
      extract.asOfDate = otb.asOfDate;
      extract.otbColumnLabel = otb.label;
      extract.months = otb.months;
      extract.warnings.push(...otb.warnings);
    }
    fill(extract.previousOtbRevenue, otb.revenue);
    fill(extract.previousRoomNights, otb.nights);
    fill(extract.lastYearActual, otb.lastYearRevenue);
    fill(extract.lastYearRoomNights, otb.lastYearNights);
    fill(extract.previousOccupancy, otb.occupancy);
    fill(extract.lastYearOccupancy, otb.lastYearOccupancy);
    fill(extract.targets, otb.targets);
    fill(extract.dinnerByMonth, otb.dinner);
    fill(extract.room0ByMonth, otb.room0);
    fill(extract.compRnsByMonth, otb.compRns);
    if (extract.targetUplift === null) extract.targetUplift = otb.targetUplift;
  });



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
