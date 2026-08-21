/**
 * CheetaPlains "Top Travel Booking Partners" source normalisation.
 *
 * The source is protel's Reservation list export (`raw creation_*.xlsx` or the
 * tidied variant), which lists one row per villa per reservation with the
 * booking partner in `Linked Profile 1` and the reservation value in `Total`.
 * Grouping those rows by partner reproduces the signed-off owner report exactly.
 *
 * The published slide shows two *independent* rankings side by side — this
 * financial year and last — so a prior-year ranking needs its own reservation
 * list upload. Each file states its own period, which is how the two are told
 * apart.
 */

export interface PartnerReservationRow {
  partner: string;
  arrival: string; // YYYY-MM-DD
  nights: number;
  total: number;
  status: string;
}

export interface PartnerParseResult {
  rows: PartnerReservationRow[];
  /** Printed `From:` / `To:` period, when the export carries one. */
  period: { from: string; to: string } | null;
  /** Printed Total row, used to reconcile the parsed rows. */
  printedTotal: number | null;
  errors: string[];
  warnings: string[];
}

export interface PartnerTotal {
  partner: string;
  nights: number;
  revenue: number;
}

type Grid = unknown[][];

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

const numeric = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  // Values print as `578812.00R` (trailing rand symbol).
  const cleaned = text(value).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isoDate = (raw: string): string | null => {
  const trimmed = raw.trim();
  const dotted = trimmed.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2}|\d{4})$/);
  if (dotted) {
    const [, dd, mm, yy] = dotted;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    return `${year}-${mm}-${dd}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

/** Profile prefixes protel adds to the linked profile name. */
const PROFILE_PREFIX = /^(travel agency|travel agent|company|source|group)\s+/i;

/** Display names the owner report uses in place of the raw profile name. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  siteminder: "Website Direct",
  "cheetah plains direct": "Website Direct",
};

/** Canonical partner label: prefix stripped, corporate suffixes dropped. */
export function normalisePartnerName(raw: string): string {
  const stripped = text(raw).replace(PROFILE_PREFIX, "").trim();
  const withoutSuffix = stripped
    .replace(/[,]?\s*\(?\bpty\b\)?\.?\s*\bltd\b\.?$/i, "")
    .replace(/[,]?\s*\b(llc|ltd|limited|gmbh|inc|s\.k\.a|pty)\b\.?$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const key = withoutSuffix.toLowerCase();
  return DISPLAY_OVERRIDES[key] ?? (withoutSuffix || stripped);
}

const HEADERS = {
  arrival: /^arrival$/i,
  nights: /^nights$/i,
  partner: /^linked profile 1$/i,
  total: /^total$/i,
  status: /^res\.? status$/i,
} as const;

type HeaderKey = keyof typeof HEADERS;

function findColumns(grid: Grid): { columns: Partial<Record<HeaderKey, number>>; headerRow: number } {
  for (let r = 0; r < Math.min(grid.length, 40); r += 1) {
    const row = grid[r] ?? [];
    const columns: Partial<Record<HeaderKey, number>> = {};
    for (let c = 0; c < row.length; c += 1) {
      const label = text(row[c]);
      if (!label) continue;
      for (const [key, pattern] of Object.entries(HEADERS) as [HeaderKey, RegExp][]) {
        if (columns[key] === undefined && pattern.test(label)) columns[key] = c;
      }
    }
    if (columns.partner !== undefined && columns.nights !== undefined && columns.total !== undefined) {
      return { columns, headerRow: r };
    }
  }
  return { columns: {}, headerRow: -1 };
}

export function isReservationListGrid(grid: Grid): boolean {
  return findColumns(grid).headerRow >= 0;
}

/** Statuses that must not count towards partner production. */
const EXCLUDED_STATUS = /cancel|no.?show|waitlist/i;

export function parseReservationList(grid: Grid, filename: string): PartnerParseResult {
  const { columns, headerRow } = findColumns(grid);
  if (headerRow < 0) {
    return {
      rows: [],
      period: null,
      printedTotal: null,
      errors: [
        `${filename}: not a protel Reservation list (needs Nights, Linked Profile 1 and Total columns)`,
      ],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const rows: PartnerReservationRow[] = [];
  let period: PartnerParseResult["period"] = null;
  let printedTotal: number | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let excluded = 0;

  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r] ?? [];

    if (r < headerRow) {
      // `From:\t01.03.2026` / `To:\t28.02.2027` live in the print header.
      for (const cell of row) {
        const value = text(cell);
        const fromMatch = value.match(/from:\s*(\S+)/i);
        const toMatch = value.match(/to:\s*(\S+)/i);
        if (fromMatch) from = isoDate(fromMatch[1]) ?? from;
        if (toMatch) to = isoDate(toMatch[1]) ?? to;
      }
      continue;
    }
    if (r === headerRow) continue;

    const partnerRaw = text(row[columns.partner!]);
    const nights = numeric(row[columns.nights!]);
    const arrival = columns.arrival !== undefined ? isoDate(text(row[columns.arrival])) : null;

    // The printed Total row has no partner and no arrival date.
    if (!partnerRaw && !arrival) {
      const label = row.map((cell) => text(cell).toLowerCase());
      if (label.some((value) => value === "total")) {
        printedTotal = numeric(row[columns.total!]);
      }
      continue;
    }
    if (!partnerRaw) {
      warnings.push(`${filename}: a reservation row has no booking partner and was skipped`);
      continue;
    }

    const status = columns.status !== undefined ? text(row[columns.status]) : "";
    if (EXCLUDED_STATUS.test(status)) {
      excluded += 1;
      continue;
    }

    rows.push({
      partner: normalisePartnerName(partnerRaw),
      arrival: arrival ?? "",
      nights: Number.isFinite(nights) ? nights : 0,
      total: numeric(row[columns.total!]),
      status,
    });
  }

  if (from && to) period = { from, to };
  if (!period && rows.length) {
    const dates = rows.map((row) => row.arrival).filter(Boolean).sort();
    if (dates.length) period = { from: dates[0], to: dates[dates.length - 1] };
  }
  if (excluded) warnings.push(`${filename}: ${excluded} cancelled/no-show reservation(s) excluded`);
  if (!rows.length) {
    return {
      rows,
      period,
      printedTotal,
      errors: [`${filename}: no reservation rows found`],
      warnings,
    };
  }

  return { rows, period, printedTotal, errors: [], warnings };
}

/** Groups reservation rows into a partner ranking by revenue. */
export function buildPartnerTotals(rows: PartnerReservationRow[], limit = 20): PartnerTotal[] {
  const totals = new Map<string, PartnerTotal>();
  for (const row of rows) {
    const bucket = totals.get(row.partner) ?? { partner: row.partner, nights: 0, revenue: 0 };
    bucket.nights += row.nights;
    bucket.revenue += row.total;
    totals.set(row.partner, bucket);
  }
  return [...totals.values()]
    .filter((entry) => entry.revenue > 0 || entry.nights > 0)
    .sort((a, b) => b.revenue - a.revenue || b.nights - a.nights)
    .slice(0, limit);
}

/**
 * Financial-year label for a period, e.g. `2026/7` for March 2026 → Feb 2027.
 * CheetaPlains runs a March–February year.
 */
export function fiscalYearLabel(iso: string, startMonth = 3): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const start = month >= startMonth ? year : year - 1;
  return `${start}/${`${start + 1}`.slice(-1)}`;
}

/**
 * Splits reservation-list files into the current and prior financial year by the
 * period each file covers. The latest period is treated as the current year.
 */
export function assignFiscalYears<T extends { period: { from: string; to: string } | null }>(
  files: T[],
): { current: T | null; prior: T | null } {
  const dated = files.filter((file) => file.period);
  if (!dated.length) return { current: files[0] ?? null, prior: null };
  const sorted = [...dated].sort((a, b) => (a.period!.from < b.period!.from ? 1 : -1));
  return { current: sorted[0], prior: sorted[1] ?? null };
}
