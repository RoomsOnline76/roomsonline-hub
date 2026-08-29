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
  /** ADR blocks, read as rates. */
  previousAdr: Record<string, number>;
  lastYearAdr: Record<string, number>;
  /** The workbook's newest OTB column, kept beside the comparison baseline. */
  currentOtbRevenue: Record<string, number>;
  /** Sheet the baseline figures were taken from. */
  baselineSheet: string | null;
  /** Target column values, and the uplift its formula was built on (0.1 = +10%). */
  targets: Record<string, number>;
  targetUplift: number | null;
  /** Multi-year grids, keyed `YYYY-MM`. */
  historicalRevenue: Record<string, number>;
  historicalRoomNights: Record<string, number>;
  historicalOccupancy: Record<string, number>;
  historicalAdr: Record<string, number>;
  /**
   * Named prior-year columns printed beside the OTB block ("2025 ACTUAL",
   * "2024 ACTUAL"), keyed by year then `YYYY-MM` of that same year.
   */
  actualsByYear: Record<string, { revenue: Record<string, number>; roomNights: Record<string, number> }>;
  /** Same-time-last-year column, keyed by the report's own months. */
  stlyRevenue: Record<string, number>;
  stlyRoomNights: Record<string, number>;
  /** Budget column, keyed by the report's own months. */
  budgetRevenue: Record<string, number>;
  budgetRoomNights: Record<string, number>;

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

/** Year stated by a real date cell (`monthOf` already handles the month). */
const yearOfCell = (value: unknown): number | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getUTCFullYear();
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(text(value));
  return iso ? Number(iso[1]) : null;
};

/** Reporting years only — keeps stray 1900/2101 rows out of the baseline. */
const plausibleYear = (year: number): boolean =>
  Number.isFinite(year) && year >= 2005 && year <= new Date().getUTCFullYear() + 5;


/** "14 Aug 2026" / "20.08.26" / "03 June 2014" → ISO date. */
const parseDateText = (raw: string): string | null => {
  const after = raw.trim();
  if (!after) return null;
  const dotted = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/.exec(after);
  if (dotted) {
    const year = Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]);
    return `${year}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`;
  }
  const named = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/.exec(after);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    const year = Number(named[3].length === 2 ? `20${named[3]}` : named[3]);
    if (month >= 0 && year >= 2000) return `${year}-${pad(month + 1)}-${pad(Number(named[1]))}`;
  }
  const parsed = new Date(after);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
  }
  return null;
};

/**
 * A dated column heading, with or without the `@` some packs use:
 * "OTB @ 14 Aug 2026", "OTB 14.08.26", "as @ 15 July 2014",
 * "On the books @ 15 July 2013", "OTB 2020/2021 @ 24 Aug 2020".
 * Comparison columns ("OTB vs LY Actual", "Variance OTB…") are not dated
 * columns and must never be picked up as one.
 */
const otbHeadingDate = (heading: string): { dated: true; date: string | null } | null => {
  const raw = text(heading).replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (!/^(otb|as at|as|on the books?)\b/i.test(raw)) return null;
  if (/\b(vs|vrs|variance)\b/i.test(raw)) return null;
  const at = raw.lastIndexOf("@");
  const body = at >= 0 ? raw.slice(at + 1).trim() : raw.replace(/^[^0-9]*/, "").trim();
  if (at < 0 && !body) return null;
  return { dated: true, date: parseDateText(body) };
};

/** Back-compat helper used for label parsing. */
const parseOtbDate = (heading: string): string | null => otbHeadingDate(heading)?.date ?? null;


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
const isOtbHeading = (value: unknown): boolean => otbHeadingDate(text(value)) !== null;

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

type BlockKind = "revenue" | "nights" | "occupancy" | "adr" | "skip";

const blockKind = (label: string): BlockKind => {
  const l = label.toLowerCase();
  // RevPAR is revenue *per available room* — never a revenue total.
  if (/revpar|rev\s*par|revenue per available/.test(l)) return "skip";
  if (/adr|avr\b|average (daily )?(room )?rate|average rate|arr\b/.test(l)) return "adr";
  // An occupancy block prints percentages, not counts — never treat it as room
  // nights, or fractions land in the nights maps and blow ADR up to millions.
  if (/room night|rm nite/.test(l)) return "nights";
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
  adr: Record<string, number>;
  lastYearAdr: Record<string, number>;
  /** Current (newest) OTB column, kept for reference alongside the baseline. */
  currentOtbRevenue: Record<string, number>;

  targets: Record<string, number>;
  targetUplift: number | null;
  dinner: Record<string, number>;
  room0: Record<string, number>;
  compRns: Record<string, number>;
  /** `{ "2024": { revenue, roomNights } }` from "<year> ACTUAL" columns. */
  actualsByYear: Record<string, { revenue: Record<string, number>; roomNights: Record<string, number> }>;
  stlyRevenue: Record<string, number>;
  stlyNights: Record<string, number>;
  budgetRevenue: Record<string, number>;
  budgetNights: Record<string, number>;
  warnings: string[];
}

/** True when a column's values change down the block (a constant is metadata). */
const varies = (rows: Row[], from: number, to: number, col: number): boolean => {
  const seen = new Set<number>();
  for (let r = from; r < to; r += 1) {
    const value = toNum((rows[r] ?? [])[col]);
    if (value !== null) seen.add(value);
    if (seen.size > 1) return true;
  }
  return false;
};

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
    adr: {},
    lastYearAdr: {},
    currentOtbRevenue: {},

    targets: {},
    targetUplift: null,
    dinner: {},
    room0: {},
    compRns: {},
    actualsByYear: {},
    stlyRevenue: {},
    stlyNights: {},
    budgetRevenue: {},
    budgetNights: {},
    warnings: [],
  };

  // 1. Locate every header row and the OTB columns it carries.
  const headers: { row: number; columns: OtbColumn[] }[] = [];
  rows.forEach((row, index) => {
    const columns: OtbColumn[] = [];
    (row ?? []).forEach((cell, col) => {
      const heading = text(cell);
      if (isOtbHeading(heading)) {
        columns.push({ col, heading, date: parseOtbDate(heading) });
      }

    });
    if (columns.length) headers.push({ row: index, columns });
  });
  if (!headers.length) return null;

  // Stale dated headings sit above empty columns in every hand-kept pack
  // ("as @ 8 Nov 2017" beside a decade of blanks). A column only counts as an
  // OTB column when its own block actually holds numbers.
  for (let h = 0; h < headers.length; h += 1) {
    const from = headers[h].row + 1;
    const to = h + 1 < headers.length ? headers[h + 1].row : rows.length;
    headers[h].columns = headers[h].columns.filter((column) => {
      for (let r = from; r < to; r += 1) {
        if (toNum((rows[r] ?? [])[column.col]) !== null) return true;
      }
      return false;
    });
  }
  const populated = headers.filter((header) => header.columns.length);
  if (!populated.length) return null;
  headers.length = 0;
  headers.push(...populated);

  const dates = [
    ...new Set(
      headers
        .flatMap((h) => h.columns.map((c) => c.date))
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();

  // The workbook usually carries several OTB columns. What this run needs is a
  // *comparison* baseline: the newest column dated no later than the run's own
  // as-of date; only fall back to the newest of all when none qualifies.
  const runDate = runAsOfDate ? runAsOfDate.slice(0, 10) : null;
  const older = runDate ? dates.filter((d) => d <= runDate) : [];
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
  } else if (runDate && !older.length) {
    result.warnings.push(
      `The workbook's only OTB column (${result.asOfDate}) is not older than this run — variances will read as zero.`,
    );
  }
  const currentDate = dates.length ? dates[dates.length - 1] : null;




  // 2. Walk each block: header row, then month rows until the block ends.
  for (let h = 0; h < headers.length; h += 1) {
    const header = headers[h];
    const end = h + 1 < headers.length ? headers[h + 1].row : rows.length;

    // Section label: this header row's own label, else the nearest label above.
    let label = rowLabel(rows[header.row] ?? []);
    if (isOtbHeading(label) || !label) {
      for (let r = header.row - 1; r >= 0 && r >= header.row - 3; r -= 1) {
        const candidate = rowLabel(rows[r] ?? []);
        if (candidate && !isOtbHeading(candidate)) {

          label = candidate;
          break;
        }
      }
    }
    const kind = blockKind(label);
    if (kind === "skip") continue;

    const dataFrom = header.row + 1;
    const isNights = kind === "nights";

    // OTB column for this block — the baseline date, count-shaped when nights.
    const candidates = header.columns.filter(
      (c) => !result.asOfDate || c.date === result.asOfDate,
    );
    let otbCol = candidates[0]?.col ?? header.columns[0].col;
    if (isNights && candidates.length > 1) {
      const counted = candidates.find((c) => looksLikeCounts(rows, dataFrom, end, c.col));
      if (counted) otbCol = counted.col;
    }
    // The newest dated column is the workbook's *current* OTB — kept apart from
    // the comparison baseline so both can be shown.
    const currentCol = currentDate
      ? (header.columns.find((c) => c.date === currentDate)?.col ?? null)
      : null;

    // Last-year and manual-input columns on this header row.
    const headerRow = rows[header.row] ?? [];
    const lyCandidates: number[] = [];
    let dinnerCol: number | null = null;
    let targetCol: number | null = null;
    let room0Col: number | null = null;
    let compCol: number | null = null;
    let nightsCol: number | null = null;
    // Named prior-year columns ("2025 ACTUAL"), same-time-last-year and budget:
    // the columns Hotel Krige-style fiscal packs print beside the OTB block.
    const yearActualCols: { year: number; col: number }[] = [];
    let stlyCol: number | null = null;
    let budgetCol: number | null = null;
    headerRow.forEach((cell, col) => {
      const heading = lower(cell);
      if (!heading) return;
      const comparative = /\b(vs|vrs|variance|var\b|%)/.test(heading);
      if (/last year/.test(heading) && !/vs|vrs/.test(heading)) lyCandidates.push(col);
      if (/^rn last year|last year.*(rn|room night)/.test(heading)) lyCandidates.push(col);
      if (/target/.test(heading) && !/vs|vrs/.test(heading)) targetCol = col;
      if (/budget/.test(heading) && !comparative) budgetCol = col;
      if (/\bstly\b|same time last year/.test(heading) && !comparative) stlyCol = col;
      const yearActual = /(?:^|\D)(19|20)(\d{2})\s*(actual|act)\b/.exec(heading);
      if (yearActual && !comparative) {
        const year = Number(`${yearActual[1]}${yearActual[2]}`);
        if (plausibleYear(year)) yearActualCols.push({ year, col });
      }
      if (/^dinner/.test(heading)) dinnerCol = col;
      if (/room\s*0/.test(heading)) room0Col = col;
      if (/comp\.?\s*(rns?|room nights?)/.test(heading)) compCol = col;
      // An undated "Room Nights" column beside an occupancy block is often the
      // rooms-available constant, not nights sold; only trust it when its
      // values actually vary month to month.
      if (/^(room nights?|rn|rm nites)$/.test(heading) && varies(rows, dataFrom, end, col)) {
        nightsCol = col;
      }

    });
    let lyCol: number | null = lyCandidates.length ? lyCandidates[0] : null;
    if (isNights && lyCandidates.length > 1) {
      const counted = lyCandidates.find((col) => looksLikeCounts(rows, dataFrom, end, col));
      if (counted !== undefined) lyCol = counted;
    }

    // An occupancy block prints percentages beside their room-night counts
    // (OPERA). Split the two so the counts land in the nights maps rather than
    // being discarded, and the percentages never pollute them.
    let occNightsCol: number | null = nightsCol;
    let occLyNightsCol: number | null = null;
    if (kind === "occupancy") {
      const isFraction = (col: number) => !looksLikeCounts(rows, dataFrom, end, col);
      const otbFraction = candidates.find((c) => isFraction(c.col));
      if (otbFraction) otbCol = otbFraction.col;
      occNightsCol = candidates.find((c) => !isFraction(c.col))?.col ?? nightsCol;
      const lyFraction = lyCandidates.find(isFraction);
      if (lyFraction !== undefined) lyCol = lyFraction;
      occLyNightsCol = lyCandidates.find((col) => !isFraction(col)) ?? null;
    }

    // 3. Month rows. A real date cell states its own year; text labels
    //    ("Jul", "Aug", …) roll forward from the baseline year.
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
      const statedYear = yearOfCell(labelCell);
      if (statedYear !== null) {
        year = statedYear;
      } else if (previousMonth && month < previousMonth) {
        year += 1;
      }
      previousMonth = month;
      if (!plausibleYear(year)) continue;
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

      // Room nights ride along with whichever block prints them.
      if (occNightsCol !== null) {
        const nights = toNum(row[occNightsCol]);
        if (nights !== null && plausibleNights(nights) && result.nights[key] === undefined) {
          result.nights[key] = nights;
        }
      }

      if (kind === "adr") {
        if (otb !== null && otb > 0) result.adr[key] = otb;
        if (ly !== null && ly > 0) result.lastYearAdr[key] = ly;
        continue;
      }

      if (kind === "occupancy") {
        const current = occupancyOf(otb);
        const lastYear = occupancyOf(ly);
        if (current !== null) result.occupancy[key] = current;
        if (lastYear !== null) result.lastYearOccupancy[key] = lastYear;
        const lyNights = occLyNightsCol === null ? null : toNum(row[occLyNightsCol]);
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
        if (currentCol !== null) {
          const current = toNum(row[currentCol]);
          if (current !== null) result.currentOtbRevenue[key] = current;
        }
        const dinner = dinnerCol === null ? null : toNum(row[dinnerCol]);
        const room0 = room0Col === null ? null : toNum(row[room0Col]);
        const comp = compCol === null ? null : toNum(row[compCol]);
        if (dinner !== null) result.dinner[key] = dinner;
        if (room0 !== null) result.room0[key] = room0;
        if (comp !== null) result.compRns[key] = comp;
      }
    }
  }
  // Packs that print revenue and ADR but no nights column still state the
  // nights implicitly — revenue ÷ ADR — so the run gets occupancy-capable data.
  const deriveNights = (
    nights: Record<string, number>,
    revenue: Record<string, number>,
    adr: Record<string, number>,
  ) => {
    for (const [month, value] of Object.entries(revenue)) {
      if (nights[month] !== undefined) continue;
      const rate = adr[month];
      if (!rate || rate <= 0) continue;
      const derived = Math.round(value / rate);
      if (plausibleNights(derived)) nights[month] = derived;
    }
  };
  deriveNights(result.nights, result.revenue, result.adr);
  deriveNights(result.lastYearNights, result.lastYearRevenue, result.lastYearAdr);

  result.months.sort();
  return result;

}

/* ───────────────── Year grids (Fin Year / Historical) ───────────────── */

interface YearGrid {
  revenue: Record<string, number>;
  roomNights: Record<string, number>;
  occupancy: Record<string, number>;
  adr: Record<string, number>;
  rows: number;
}

/**
 * Reads any "years across, months down" grid. A header row is one carrying two
 * or more four-digit year cells; the nearest label above it decides whether the
 * block is revenue, room nights, occupancy or ADR. Repeated year columns
 * (revenue next to occupancy) keep their first occurrence.
 */
function parseYearGrid(rows: Row[]): YearGrid {
  const grid: YearGrid = { revenue: {}, roomNights: {}, occupancy: {}, adr: {}, rows: 0 };
  let columns: { year: number; col: number }[] = [];
  let mode: "revenue" | "nights" | "occupancy" | "adr" | null = null;
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
      const known = /revenue|room night|occupancy|adr|avr|average (daily )?(room )?rate|revpar|target/i;
      const source = known.test(label) ? label : lastLabel;
      if (/room night/i.test(source)) mode = "nights";
      else if (/occupancy|occ\s*%/i.test(source)) mode = "occupancy";
      else if (/revpar|rev\s*par/i.test(source)) mode = null;
      else if (/adr|avr\b|average (daily )?(room )?rate/i.test(source)) mode = "adr";
      else if (/revenue/i.test(source)) mode = "revenue";
      else if (known.test(source)) mode = null;
      // An unlabelled first block is the revenue grid; later unlabelled blocks
      // (targets, variances) are ignored rather than guessed at.
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
      mode === "nights"
        ? grid.roomNights
        : mode === "occupancy"
          ? grid.occupancy
          : mode === "adr"
            ? grid.adr
            : grid.revenue;
    for (const { year, col } of columns) {
      if (!plausibleYear(year)) continue;
      const raw = toNum(cells[col]);
      if (raw === null) continue;
      const value = mode === "occupancy" ? occupancyOf(raw) : raw;
      if (value === null) continue;
      if (mode === "nights" && !plausibleNights(value)) continue;
      if (mode === "adr" && value <= 0) continue;
      target[`${year}-${pad(month)}`] = value;
      grid.rows += 1;
    }
  });

  return grid;
}

/**
 * Shape test for a multi-year grid, so a sheet named "YOY", "Year on Year",
 * "History 2015-2025" or anything else the revenue team invents is still read.
 * A qualifying sheet has a header row of three or more distinct reporting years
 * and at least three month rows carrying numbers under those year columns.
 */
function looksLikeYearMatrix(rows: Row[]): boolean {
  for (let r = 0; r < rows.length; r += 1) {
    const cells = rows[r] ?? [];
    const yearCols: number[] = [];
    const seen = new Set<number>();
    cells.forEach((cell, col) => {
      const year = yearOf(cell);
      if (year !== null && plausibleYear(year) && !seen.has(year)) {
        seen.add(year);
        yearCols.push(col);
      }
    });
    if (yearCols.length < 3) continue;

    let monthRows = 0;
    for (let n = r + 1; n < Math.min(rows.length, r + 20); n += 1) {
      const next = rows[n] ?? [];
      if (monthOf(next[0]) === null && monthOf(next[1]) === null) continue;
      if (yearCols.some((col) => toNum(next[col]) !== null)) monthRows += 1;
    }
    if (monthRows >= 3) return true;
  }
  return false;
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
    previousAdr: {},
    lastYearAdr: {},
    currentOtbRevenue: {},
    baselineSheet: null,
    targets: {},
    targetUplift: null,
    historicalRevenue: {},
    historicalRoomNights: {},
    historicalOccupancy: {},
    historicalAdr: {},

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

    // Named year grids, plus any sheet whose shape is a years-across matrix
    // ("YOY", "Year on Year", "History 2015-2025" …).
    const namedYearGrid = /fin\s*year|historic|stats|yoy|y\s*[-o]\s*y|year\s*on\s*year/.test(key);
    if (namedYearGrid || looksLikeYearMatrix(rows)) {
      const grid = parseYearGrid(rows);
      if (!grid.rows) {
        extract.sheetsSkipped.push(name);
        continue;
      }
      extract.sheetsRead.push(name);
      // The longer-running record wins for a month present in more than one
      // grid, so single-year sheets (Fin Year) merge first and multi-year
      // matrices (Historical / YOY) merge after.
      const longRunning = /historic|stats|yoy|y\s*[-o]\s*y|year\s*on\s*year/.test(key) ||
        !/fin\s*year/.test(key);
      const merge = (
        existing: Record<string, number>,
        incoming: Record<string, number>,
      ): Record<string, number> =>
        longRunning ? { ...existing, ...incoming } : { ...incoming, ...existing };

      extract.historicalRevenue = merge(extract.historicalRevenue, grid.revenue);
      extract.historicalRoomNights = merge(extract.historicalRoomNights, grid.roomNights);
      extract.historicalOccupancy = merge(extract.historicalOccupancy, grid.occupancy);
      extract.historicalAdr = merge(extract.historicalAdr, grid.adr);

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
  // archive carries a decade of them). The sheet that actually covers the run's
  // own reporting months is the truthful baseline — a 2011 vintage must never
  // outrank the current grid just because its heading carries an `@`. Within
  // equally relevant sheets, the vintage closest to the run's as-of date wins.
  const runDate = options.runAsOfDate ?? null;
  const runMonth = runDate ? runDate.slice(0, 7) : null;
  const covers = (months: string[]): boolean =>
    Boolean(runMonth) && months.some((month) => month >= runMonth!);
  const rank = (otb: OtbResult): [number, number, number] => {
    const relevance = covers(otb.months) ? 0 : 1;
    const asOfDate = otb.asOfDate;
    if (!asOfDate) return [relevance, 2, 0];
    const days = Date.parse(`${asOfDate}T00:00:00Z`);
    if (!Number.isFinite(days)) return [relevance, 2, 0];
    const runDays = runDate ? Date.parse(`${runDate}T00:00:00Z`) : NaN;
    if (Number.isFinite(runDays) && days > runDays) return [relevance, 1, -days];
    return [relevance, 0, -days];
  };
  otbSheets.sort((a, b) => {
    const [relA, groupA, orderA] = rank(a.otb);
    const [relB, groupB, orderB] = rank(b.otb);
    return relA - relB || groupA - groupB || orderA - orderB;
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
      extract.baselineSheet = name;
    }
    fill(extract.previousOtbRevenue, otb.revenue);
    fill(extract.previousRoomNights, otb.nights);
    fill(extract.currentOtbRevenue, otb.currentOtbRevenue);
    fill(extract.lastYearActual, otb.lastYearRevenue);
    fill(extract.lastYearRoomNights, otb.lastYearNights);
    fill(extract.previousOccupancy, otb.occupancy);
    fill(extract.lastYearOccupancy, otb.lastYearOccupancy);
    fill(extract.previousAdr, otb.adr);
    fill(extract.lastYearAdr, otb.lastYearAdr);
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
