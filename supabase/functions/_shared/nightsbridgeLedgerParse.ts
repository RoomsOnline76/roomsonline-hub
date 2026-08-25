// Resilient NightsBridge bookings-ledger matcher.
//
// NightsBridge exports vary a lot: different column spellings and order, title
// blocks of any height, the ledger on any sheet, sometimes CSV, sometimes a
// printed PDF. Rather than expecting one shape, this module actively seeks each
// field — first by header text, then by the shape of the data underneath — and
// derives what it can from what it found. When a required field still cannot be
// resolved confidently the file is reported as `needs_mapping` so a reviewer can
// point at the right columns instead of the run failing.
import type { LedgerRow } from "./nightsbridgeAggregate.ts";

export type LedgerField =
  | "booking_id"
  | "arrival"
  | "last_night"
  | "nights"
  | "revenue"
  | "extras"
  | "commission"
  | "nett"
  | "room_name"
  | "source"
  | "status"
  | "type"
  | "currency";

export type MatchBasis =
  | "exact_header"
  | "header_phrase"
  | "header_tokens"
  | "data_shape"
  | "reviewer";

export interface FieldMatch {
  column: number;
  confidence: number; // 0..1
  basis: MatchBasis;
  header: string;
}

export type MappingDetail = Partial<Record<LedgerField, FieldMatch>>;
/** Reviewer-supplied or persisted mapping: field -> column index. */
export type ColumnMap = Partial<Record<LedgerField, number>>;

export type ParseStatus = "parsed" | "needs_mapping" | "failed";

export interface LedgerParseResult {
  status: ParseStatus;
  rows: LedgerRow[];
  errors: string[];
  notes: string[];
  skipped: number;
  sheet: string | null;
  headerRow: number | null;
  headers: string[];
  sampleRows: string[][];
  mapping: MappingDetail;
  /** Fields that could not be resolved confidently and need a reviewer. */
  unresolved: LedgerField[];
  /** Header fingerprint, used to reuse a confirmed mapping on later files. */
  fingerprint: string | null;
}

export interface SheetGrid {
  name: string;
  grid: unknown[][];
}

/* ------------------------------------------------------------------ aliases */

const ALIASES: Record<LedgerField, string[]> = {
  booking_id: [
    "booking id", "bookingid", "booking no", "booking number", "booking ref",
    "reference", "res id", "reservation id", "bkg id", "nbid", "id",
  ],
  arrival: [
    "arrival date", "arrival", "arrive", "check in", "check-in", "checkin",
    "date in", "from", "from date", "start date", "first night", "date arrived",
  ],
  last_night: [
    "last night", "departure date", "departure", "depart", "check out",
    "check-out", "checkout", "date out", "to", "to date", "end date",
  ],
  nights: [
    "nights", "no of nights", "no. of nights", "number of nights", "night",
    "nts", "room nights", "days", "los", "length of stay",
  ],
  revenue: [
    "revenue", "accommodation", "accommodation revenue", "accom", "room revenue",
    "gross", "gross revenue", "total revenue", "amount", "total", "value", "rate total",
  ],
  extras: ["extras", "extra", "extras revenue", "additional", "add ons", "add-ons"],
  commission: ["commission", "comm", "commission amount", "agent commission"],
  nett: ["nett", "net", "nett revenue", "net revenue", "nett amount", "net amount", "payable"],
  room_name: [
    "room name", "room", "rooms", "unit", "unit name", "room type", "roomtype",
    "accommodation type", "room description", "room no", "room number",
  ],
  source: ["source", "booking source", "channel", "agent", "made through", "origin", "market"],
  status: ["status", "booking status", "state"],
  type: ["type", "booking type", "rate type", "res type", "category"],
  currency: ["currency", "curr", "ccy"],
};

/** Fields the ledger cannot be built without. */
export const REQUIRED_FIELDS: LedgerField[] = ["arrival", "nights", "revenue", "room_name"];
/** A header row must expose at least one of these to be a bookings ledger. */
const SIGNATURE_FIELDS: LedgerField[] = ["arrival", "nights", "revenue"];
/** Below this confidence a required field is escalated to the reviewer. */
const CONFIDENCE_FLOOR = 0.5;

export const FIELD_LABELS: Record<LedgerField, string> = {
  booking_id: "Booking ID",
  arrival: "Arrival date",
  last_night: "Last night / departure",
  nights: "Nights",
  revenue: "Revenue",
  extras: "Extras",
  commission: "Commission",
  nett: "Nett",
  room_name: "Room / unit",
  source: "Source",
  status: "Status",
  type: "Type",
  currency: "Currency",
};

/* ------------------------------------------------------------- value helpers */

const norm = (value: unknown): string =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_/\\]+/g, " ")
    .replace(/[^a-z0-9\s.&-]/g, "")
    .replace(/\s+/g, " ");

const tokens = (value: string): string[] => value.split(/[\s.&-]+/).filter(Boolean);

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const raw = value.trim();
  if (!raw) return NaN;
  // Reject anything that is not essentially a number: "A-1", "Suite 2" and
  // "3 nights" must never read as figures.
  if (!/^[-(]?\s*[R$€£]?\s*[\d\s.,]+\)?\s*%?$/.test(raw)) return NaN;

  const negative = /^\(.*\)$/.test(raw) || raw.startsWith("-");
  // Strip currency symbols, spaces and thousands separators; keep the last
  // decimal separator whichever convention was used.
  let body = raw.replace(/[()]/g, "").replace(/[^\d.,-]/g, "");
  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  if (lastComma >= 0 && lastComma > lastDot) {
    body = body.replace(/\./g, "").replace(",", ".");
  } else {
    body = body.replace(/,/g, "");
  }
  const parsed = Number(body.replace(/-/g, ""));
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -parsed : parsed;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1990 || y > 2100) return null;
  return `${y}-${`${m}`.padStart(2, "0")}-${`${d}`.padStart(2, "0")}`;
};

/** Excel serial date -> ISO, without pulling in SheetJS. */
const serialToIso = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

export const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") return serialToIso(value);
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) return iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);

  // d/m/y and d/m/yy — NightsBridge is day-first. When the first part cannot be
  // a day but the second can, fall back to month-first.
  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const a = +dmy[1];
    const b = +dmy[2];
    return a > 12 && b <= 12 ? iso(year, b, a) : iso(year, b, a) ?? iso(year, a, b);
  }

  // 12 Aug 2026 / 12-Aug-26 / Aug 12 2026
  const dMon = raw.match(/^(\d{1,2})\s*[-\s]\s*([a-z]{3,9})\.?\s*[-,\s]\s*(\d{2,4})/i);
  if (dMon) {
    const month = MONTHS[dMon[2].slice(0, 4).toLowerCase()] ?? MONTHS[dMon[2].slice(0, 3).toLowerCase()];
    let year = +dMon[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month) return iso(year, month, +dMon[1]);
  }
  const monD = raw.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})/i);
  if (monD) {
    const month = MONTHS[monD[1].slice(0, 4).toLowerCase()] ?? MONTHS[monD[1].slice(0, 3).toLowerCase()];
    let year = +monD[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month) return iso(year, month, +monD[2]);
  }
  // A numeric string holding an Excel serial.
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return serialToIso(numeric);
  return null;
};

const addDays = (isoDate: string, days: number): string | null => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const dayDiff = (from: string, to: string): number => {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
};

/* ---------------------------------------------------------- header matching */

const scoreHeader = (header: string, aliases: string[]): { score: number; basis: MatchBasis } | null => {
  if (!header) return null;
  if (aliases.includes(header)) return { score: 1, basis: "exact_header" };
  for (const alias of aliases) {
    if (header.length > 2 && (header.includes(` ${alias}`) || header.startsWith(`${alias} `) || header === alias)) {
      return { score: 0.85, basis: "header_phrase" };
    }
  }
  for (const alias of aliases) {
    if (header.length > 2 && header.includes(alias)) return { score: 0.7, basis: "header_phrase" };
  }
  const headerTokens = tokens(header);
  for (const alias of aliases) {
    const aliasTokens = tokens(alias);
    if (!aliasTokens.length) continue;
    const hits = aliasTokens.filter((t) => headerTokens.includes(t)).length;
    if (hits === aliasTokens.length) return { score: 0.6, basis: "header_tokens" };
  }
  return null;
};

/** Column statistics used to infer a field when its header is unrecognisable. */
interface ColumnShape {
  dateRatio: number;
  numberRatio: number;
  textRatio: number;
  mean: number;
  maxAbs: number;
  intRatio: number;
  distinct: number;
  filled: number;
}

const shapeOf = (grid: unknown[][], headerIndex: number, column: number): ColumnShape => {
  let dates = 0;
  let numbers = 0;
  let text = 0;
  let filled = 0;
  let sum = 0;
  let maxAbs = 0;
  let ints = 0;
  const seen = new Set<string>();
  for (let r = headerIndex + 1; r < Math.min(grid.length, headerIndex + 400); r += 1) {
    const cell = (grid[r] ?? [])[column];
    if (cell === null || cell === undefined || cell === "") continue;
    filled += 1;
    seen.add(String(cell));
    if (toIsoDate(cell)) {
      dates += 1;
      continue;
    }
    const num = toNumber(cell);
    if (Number.isFinite(num)) {
      numbers += 1;
      sum += num;
      maxAbs = Math.max(maxAbs, Math.abs(num));
      if (Number.isInteger(num)) ints += 1;
      continue;
    }
    text += 1;
  }
  const denom = filled || 1;
  return {
    dateRatio: dates / denom,
    numberRatio: numbers / denom,
    textRatio: text / denom,
    mean: numbers ? sum / numbers : 0,
    maxAbs,
    intRatio: numbers ? ints / numbers : 0,
    distinct: seen.size,
    filled,
  };
};

/**
 * Resolves every field for a candidate header row: header text first, then the
 * shape of the data for any required field still missing.
 */
export function resolveColumns(grid: unknown[][], headerIndex: number): MappingDetail {
  const headers = (grid[headerIndex] ?? []).map(norm);
  const mapping: MappingDetail = {};
  const taken = new Set<number>();

  // Highest-confidence header matches win, and a column is used once.
  const candidates: Array<{ field: LedgerField; column: number; score: number; basis: MatchBasis }> = [];
  for (const field of Object.keys(ALIASES) as LedgerField[]) {
    headers.forEach((header, column) => {
      const hit = scoreHeader(header, ALIASES[field]);
      if (hit) candidates.push({ field, column, score: hit.score, basis: hit.basis });
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (mapping[candidate.field] || taken.has(candidate.column)) continue;
    mapping[candidate.field] = {
      column: candidate.column,
      confidence: candidate.score,
      basis: candidate.basis,
      header: String((grid[headerIndex] ?? [])[candidate.column] ?? ""),
    };
    taken.add(candidate.column);
  }

  // Data-shape inference for required fields with no header match.
  const width = Math.max(headers.length, ...grid.slice(headerIndex + 1, headerIndex + 30).map((r) => (r ?? []).length));
  const shapes: ColumnShape[] = [];
  for (let column = 0; column < width; column += 1) {
    shapes.push(shapeOf(grid, headerIndex, column));
  }
  const infer = (field: LedgerField, pick: (shape: ColumnShape, column: number) => number) => {
    if (mapping[field]) return;
    let best = -1;
    let bestColumn = -1;
    for (let column = 0; column < width; column += 1) {
      if (taken.has(column)) continue;
      const shape = shapes[column];
      if (shape.filled < 2) continue;
      const value = pick(shape, column);
      if (value > best) {
        best = value;
        bestColumn = column;
      }
    }
    if (bestColumn >= 0 && best > 0) {
      mapping[field] = {
        column: bestColumn,
        confidence: Math.min(0.55, 0.3 + best * 0.2),
        basis: "data_shape",
        header: String((grid[headerIndex] ?? [])[bestColumn] ?? ""),
      };
      taken.add(bestColumn);
    }
  };

  infer("arrival", (shape) => (shape.dateRatio > 0.7 ? shape.dateRatio : 0));
  infer("last_night", (shape) => (shape.dateRatio > 0.7 ? shape.dateRatio : 0));
  // Nights can be derived from the two dates, so only guess a column when it
  // cannot be — an inferred integer column is easily the wrong one.
  if (!(mapping.arrival && mapping.last_night)) {
    infer(
      "nights",
      (shape) => (shape.numberRatio > 0.7 && shape.intRatio > 0.8 && shape.maxAbs <= 90 ? shape.numberRatio : 0),
    );
  }
  if (!mapping.nett) {
    infer("revenue", (shape) => (shape.numberRatio > 0.7 && shape.mean > 50 ? shape.mean / (shape.maxAbs || 1) : 0));
  }
  infer(
    "room_name",
    (shape) => (shape.textRatio > 0.7 && shape.distinct > 1 && shape.distinct <= Math.max(4, shape.filled) ? shape.textRatio : 0),
  );


  return mapping;
}

/* ------------------------------------------------------------ block picking */

interface Candidate {
  sheet: string;
  grid: unknown[][];
  headerIndex: number;
  mapping: MappingDetail;
  score: number;
}

const rowsWithDates = (grid: unknown[][], headerIndex: number, column: number): number => {
  let hits = 0;
  for (let r = headerIndex + 1; r < grid.length; r += 1) {
    if (toIsoDate((grid[r] ?? [])[column])) hits += 1;
  }
  return hits;
};

/** Scans every sheet and every plausible header row; the richest block wins. */
function pickCandidate(sheets: SheetGrid[]): Candidate | null {
  let best: Candidate | null = null;
  for (const { name, grid } of sheets) {
    const limit = Math.min(grid.length, 60);
    for (let i = 0; i < limit; i += 1) {
      const cells = grid[i] ?? [];
      if (cells.filter((cell) => norm(cell)).length < 3) continue;
      const mapping = resolveColumns(grid, i);
      // Money may only be present as nett, and nights only as a date pair.
      const evidence = [
        mapping.arrival,
        mapping.nights ?? mapping.last_night,
        mapping.revenue ?? mapping.nett,
      ].filter(Boolean).length;
      if (evidence < 2) continue;

      const arrivalColumn = mapping.arrival?.column;
      const dated = arrivalColumn === undefined ? 0 : rowsWithDates(grid, i, arrivalColumn);
      if (dated < 1) continue;
      const resolved = REQUIRED_FIELDS.filter((field) => mapping[field]).length;
      const confidence = REQUIRED_FIELDS.reduce((sum, field) => sum + (mapping[field]?.confidence ?? 0), 0);
      const score = dated * 10 + resolved * 5 + confidence;
      if (!best || score > best.score) {
        best = { sheet: name, grid, headerIndex: i, mapping, score };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------- row building */

const text = (value: unknown): string => String(value ?? "").trim();

interface BuildOutcome {
  rows: LedgerRow[];
  skipped: number;
  notes: string[];
}

function buildRows(
  grid: unknown[][],
  headerIndex: number,
  mapping: MappingDetail,
  fallbackRoom: string,
  fallbackCurrency: string,
): BuildOutcome {
  const rows: LedgerRow[] = [];
  const notes = new Set<string>();
  let skipped = 0;

  const at = (row: unknown[], field: LedgerField): unknown => {
    const column = mapping[field]?.column;
    return column === undefined ? undefined : row[column];
  };
  const num = (row: unknown[], field: LedgerField): number => {
    const value = toNumber(at(row, field));
    return Number.isFinite(value) ? value : NaN;
  };

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    if (row.every((cell) => cell === null || cell === undefined || cell === "")) continue;

    let arrival = toIsoDate(at(row, "arrival"));
    let lastNight = toIsoDate(at(row, "last_night"));
    let nights = num(row, "nights");
    const extras = num(row, "extras");
    const commission = num(row, "commission");
    const nett = num(row, "nett");
    let revenue = num(row, "revenue");

    // Derivations: reconstruct rather than drop the row.
    if (!arrival && lastNight && Number.isFinite(nights)) {
      arrival = addDays(lastNight, -(nights - 1));
      if (arrival) notes.add("arrival derived from departure and nights");
    }
    if (!Number.isFinite(nights) && arrival && lastNight) {
      const diff = dayDiff(arrival, lastNight);
      // "Last night" and "departure" differ by one; both spellings appear.
      nights = diff <= 0 ? 1 : diff;
      notes.add("nights derived from arrival and departure");
    }
    if (!lastNight && arrival && Number.isFinite(nights)) {
      lastNight = addDays(arrival, Math.max(0, nights - 1));
    }
    if (!Number.isFinite(revenue)) {
      if (Number.isFinite(nett)) {
        revenue = nett + (Number.isFinite(commission) ? commission : 0);
        notes.add("revenue derived from nett plus commission");
      } else if (Number.isFinite(extras)) {
        revenue = extras;
        notes.add("revenue taken from the extras column");
      }
    }

    // A summary/total line has no arrival date; ignore it silently.
    const looksTotal = /total|subtotal|grand/i.test(text(row[0]));
    if (!arrival || !Number.isFinite(nights) || !Number.isFinite(revenue)) {
      if (!looksTotal) skipped += 1;
      continue;
    }

    const roomName = text(at(row, "room_name")) || fallbackRoom;
    rows.push({
      booking_id: text(at(row, "booking_id")).replace(/\.0$/, ""),
      arrival,
      last_night: lastNight,
      nights,
      revenue,
      extras: Number.isFinite(extras) ? extras : 0,
      commission: Number.isFinite(commission) ? commission : 0,
      nett: Number.isFinite(nett) ? nett : revenue - (Number.isFinite(commission) ? commission : 0),
      room_name: roomName,
      source: text(at(row, "source")),
      status: text(at(row, "status")),
      type: text(at(row, "type")),
      currency: text(at(row, "currency")) || fallbackCurrency,
    });
  }

  return { rows, skipped, notes: [...notes] };
}

/* -------------------------------------------------------------- entry point */

export interface LedgerParseOptions {
  filename: string;
  /** Reviewer-confirmed or persisted mapping, applied over the detected one. */
  override?: ColumnMap | null;
  /** Sheet the override applies to, when known. */
  overrideSheet?: string | null;
  fallbackRoom?: string;
  fallbackCurrency?: string;
}

export const headerFingerprint = (headers: string[]): string =>
  headers.map(norm).filter(Boolean).join("|");

const emptyResult = (errors: string[]): LedgerParseResult => ({
  status: "failed",
  rows: [],
  errors,
  notes: [],
  skipped: 0,
  sheet: null,
  headerRow: null,
  headers: [],
  sampleRows: [],
  mapping: {},
  unresolved: [...REQUIRED_FIELDS],
  fingerprint: null,
});

export function parseLedgerSheets(
  sheets: SheetGrid[],
  options: LedgerParseOptions,
): LedgerParseResult {
  const { filename } = options;
  const usable = sheets.filter((sheet) => sheet.grid.length > 0);
  if (!usable.length) return emptyResult([`${filename}: no readable rows found`]);

  let candidate = pickCandidate(usable);
  // A reviewer mapping must work even when nothing was auto-detected: take the
  // named sheet (or the first) and its widest row as the header.
  if (!candidate && options.override) {
    const sheet =
      usable.find((entry) => entry.name === options.overrideSheet) ?? usable[0];
    let headerIndex = 0;
    let width = 0;
    for (let i = 0; i < Math.min(sheet.grid.length, 40); i += 1) {
      const filled = (sheet.grid[i] ?? []).filter((cell) => norm(cell)).length;
      if (filled > width) {
        width = filled;
        headerIndex = i;
      }
    }
    candidate = { sheet: sheet.name, grid: sheet.grid, headerIndex, mapping: {}, score: 0 };
  }
  if (!candidate) {

    const looksConsolidated = usable[0].grid
      .slice(0, 30)
      .some((row) => (row ?? []).map(norm).some((cell) => /\botb\b|on the books|budget/.test(cell)));
    // Still offer a manual mapping instead of a dead end: expose the widest row
    // of the first sheet as the header candidate.
    const grid = usable[0].grid;
    let headerIndex = 0;
    let width = 0;
    for (let i = 0; i < Math.min(grid.length, 30); i += 1) {
      const filled = (grid[i] ?? []).filter((cell) => norm(cell)).length;
      if (filled > width) {
        width = filled;
        headerIndex = i;
      }
    }
    const headers = (grid[headerIndex] ?? []).map((cell) => text(cell));
    return {
      status: width >= 3 ? "needs_mapping" : "failed",
      rows: [],
      errors: [
        looksConsolidated
          ? `${filename}: this looks like the consolidated revenue report, not a bookings export — upload it at the "previous report" step instead.`
          : `${filename}: the booking columns could not be recognised automatically — map them below to continue.`,
      ],
      notes: [],
      skipped: 0,
      sheet: usable[0].name,
      headerRow: headerIndex,
      headers,
      sampleRows: grid.slice(headerIndex + 1, headerIndex + 6).map((row) => (row ?? []).map((cell) => text(cell))),
      mapping: {},
      unresolved: [...REQUIRED_FIELDS],
      fingerprint: headerFingerprint(headers),
    };
  }

  const mapping: MappingDetail = { ...candidate.mapping };
  const headers = (candidate.grid[candidate.headerIndex] ?? []).map((cell) => text(cell));
  const fingerprint = headerFingerprint(headers);

  // Apply a reviewer / remembered mapping on top of detection.
  const override = options.override ?? null;
  if (override && (!options.overrideSheet || options.overrideSheet === candidate.sheet)) {
    for (const [field, column] of Object.entries(override) as Array<[LedgerField, number | undefined]>) {
      if (column === undefined || column === null || column < 0) {
        delete mapping[field];
        continue;
      }
      mapping[field] = {
        column,
        confidence: 1,
        basis: "reviewer",
        header: headers[column] ?? "",
      };
    }
  }

  const unresolved = REQUIRED_FIELDS.filter((field) => {
    // A single-unit export may carry no room column at all.
    if (field === "room_name") return false;
    // Fields that can be reconstructed from what was found count as resolved.
    if (field === "nights" && mapping.arrival && mapping.last_night) return false;
    if (field === "arrival" && mapping.last_night && mapping.nights) return false;
    if (field === "revenue" && mapping.nett) return false;
    const match = mapping[field];
    if (!match) return true;
    return match.confidence < CONFIDENCE_FLOOR;
  });


  const sampleRows = candidate.grid
    .slice(candidate.headerIndex + 1, candidate.headerIndex + 6)
    .map((row) => (row ?? []).map((cell) => text(cell)));

  if (unresolved.length) {
    return {
      status: "needs_mapping",
      rows: [],
      errors: [
        `${filename}: could not confidently identify ${unresolved
          .map((field) => FIELD_LABELS[field])
          .join(", ")} — confirm the columns below.`,
      ],
      notes: [`Reading sheet "${candidate.sheet}", header row ${candidate.headerIndex + 1}.`],
      skipped: 0,
      sheet: candidate.sheet,
      headerRow: candidate.headerIndex,
      headers,
      sampleRows,
      mapping,
      unresolved,
      fingerprint,
    };
  }

  const built = buildRows(
    candidate.grid,
    candidate.headerIndex,
    mapping,
    options.fallbackRoom ?? "Unit 1",
    options.fallbackCurrency ?? "ZAR",
  );

  const notes: string[] = [
    `Sheet "${candidate.sheet}", header row ${candidate.headerIndex + 1}.`,
    ...(Object.entries(mapping) as Array<[LedgerField, FieldMatch]>)
      .filter(([, match]) => match.basis === "data_shape" || match.basis === "reviewer")
      .map(([field, match]) =>
        `${FIELD_LABELS[field]}: column ${match.column + 1}${match.header ? ` ("${match.header}")` : ""} — ${
          match.basis === "reviewer" ? "set by reviewer" : "inferred from the data"
        }`,
      ),
    ...built.notes,
  ];
  if (!mapping.room_name) notes.push('No room column found — rows attributed to "Unit 1".');

  const errors: string[] = [];
  if (built.skipped > 0) {
    errors.push(`${built.skipped} row(s) skipped: no usable arrival date, nights or revenue`);
  }
  if (!built.rows.length) {
    errors.unshift(`${filename}: the ledger was found but no rows carried usable figures — confirm the columns below.`);
    return {
      status: "needs_mapping",
      rows: [],
      errors,
      notes,
      skipped: built.skipped,
      sheet: candidate.sheet,
      headerRow: candidate.headerIndex,
      headers,
      sampleRows,
      mapping,
      unresolved: [],
      fingerprint,
    };
  }

  return {
    status: "parsed",
    rows: built.rows,
    errors,
    notes,
    skipped: built.skipped,
    sheet: candidate.sheet,
    headerRow: candidate.headerIndex,
    headers,
    sampleRows,
    mapping,
    unresolved: [],
    fingerprint,
  };
}

/* ------------------------------------------------------- alternative inputs */

/** Sniffs the delimiter of a CSV/TXT export and returns a grid. */
export function gridFromDelimited(content: string): unknown[][] {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sample = text.split("\n").slice(0, 20).join("\n");
  const delimiters = [",", ";", "\t", "|"];
  let delimiter = ",";
  let best = -1;
  for (const candidate of delimiters) {
    const count = sample.split(candidate).length - 1;
    if (count > best) {
      best = count;
      delimiter = candidate;
    }
  }

  const grid: unknown[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) grid.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      pushCell();
      continue;
    }
    if (char === "\n") {
      pushRow();
      continue;
    }
    cell += char;
  }
  if (cell || row.length) pushRow();
  return grid;
}

export interface PdfItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Rebuilds a grid from positioned PDF text items: cluster by baseline into
 * rows, then bucket x positions into shared columns so a printed bookings
 * summary reads like a spreadsheet.
 */
export function gridFromPdfItems(items: PdfItem[], tolerance = 2.5): unknown[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }

  // Column anchors: every distinct x start, merged when close together.
  const anchors: number[] = [];
  for (const line of lines) {
    for (const item of line) {
      if (!anchors.some((anchor) => Math.abs(anchor - item.x) <= 6)) anchors.push(item.x);
    }
  }
  anchors.sort((a, b) => a - b);

  const columnOf = (x: number): number => {
    let index = 0;
    let distance = Infinity;
    anchors.forEach((anchor, i) => {
      const delta = Math.abs(anchor - x);
      if (delta < distance) {
        distance = delta;
        index = i;
      }
    });
    return index;
  };

  return lines.map((line) => {
    const row: unknown[] = new Array(anchors.length).fill("");
    for (const item of line.sort((a, b) => a.x - b.x)) {
      const column = columnOf(item.x);
      row[column] = `${row[column] ? `${row[column]} ` : ""}${item.str.trim()}`.trim();
    }
    return row;
  });
}
