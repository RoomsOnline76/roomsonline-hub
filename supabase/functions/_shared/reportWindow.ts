// The report window for a run: the month just closed before the as-of date and
// everything forward. Uploaded extracts for earlier months (last year's actuals
// dropped into the same upload set) must not become rows of their own — they are
// last-year comparatives, so they are lifted out here and folded into the
// property's historical baseline by the caller.

export interface WindowAggregate {
  months: string[];
  otb_revenue: Record<string, number>;
  room_nights: Record<string, number>;
  capacity_days: Record<string, number>;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  totals?: Record<string, number>;
}

export interface PastMonthActual {
  month: string;
  revenue: number;
  nights: number;
}

/**
 * The month a run reports on. `report_month` is authoritative when the reviewer
 * has set it; otherwise a run dated in the first days of a month is taken to
 * cover the month just closed, anything later covers its own month.
 */
export function reportMonthAnchor(
  asOfDate: string,
  reportMonth?: string | null,
): string {
  const explicit = String(reportMonth ?? "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const iso = String(asOfDate ?? "").slice(0, 10);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return "0000-01";
  }
  const offset = Number.isFinite(day) && day < 5 ? -1 : 0;
  const start = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${start.getUTCFullYear()}-${`${start.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

/** `YYYY-MM` of the earliest month a run's window may contain. */
export function windowStartMonth(asOfDate: string, reportMonth?: string | null): string {
  return reportMonthAnchor(asOfDate, reportMonth);
}

/**
 * Drops months that fall before the run's window from the aggregate, recomputes
 * the totals, and returns the removed months with their parsed actuals.
 */
export function trimToReportWindow(
  aggregate: WindowAggregate,
  asOfDate: string,
  reportMonth?: string | null,
): PastMonthActual[] {
  const start = windowStartMonth(asOfDate, reportMonth);
  const past: PastMonthActual[] = [];
  const kept: string[] = [];

  for (const key of aggregate.months) {
    if (key >= start) {
      kept.push(key);
      continue;
    }
    past.push({
      month: key,
      revenue: Number(aggregate.otb_revenue[key]) || 0,
      nights: Number(aggregate.room_nights[key]) || 0,
    });
    delete aggregate.otb_revenue[key];
    delete aggregate.room_nights[key];
    delete aggregate.capacity_days[key];
    delete aggregate.adr[key];
    delete aggregate.occupancy[key];
  }

  if (past.length === 0) return past;

  aggregate.months = kept;
  if (aggregate.totals) {
    let revenue = 0;
    let nights = 0;
    let capacity = 0;
    for (const key of kept) {
      revenue += Number(aggregate.otb_revenue[key]) || 0;
      nights += Number(aggregate.room_nights[key]) || 0;
      capacity += Number(aggregate.capacity_days[key]) || 0;
    }
    aggregate.totals.revenue = Math.round(revenue * 100) / 100;
    aggregate.totals.nights = nights;
    aggregate.totals.capacity_days = capacity;
    aggregate.totals.adr = nights > 0 ? Math.round((revenue / nights) * 100) / 100 : 0;
    aggregate.totals.occupancy = capacity > 0 ? nights / capacity : 0;
  }
  return past;
}

/** Plain-English summary for the run event log. */
export function pastMonthsNote(past: PastMonthActual[]): string {
  const months = past.map((entry) => entry.month).join(", ");
  return `${past.length} uploaded month(s) fall before this review window (${months}) — used as last-year actuals instead of report months.`;
}

/** How many months the printed report shows: the review month plus five ahead. */
export const REPORT_WINDOW_MONTHS = 6;

const addMonths = (key: string, delta: number): string => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
};

/** `YYYY-MM` of the last month the printed report may show. */
export function windowEndMonth(asOfDate: string, reportMonth?: string | null): string {
  return addMonths(windowStartMonth(asOfDate, reportMonth), REPORT_WINDOW_MONTHS - 1);
}

/**
 * Every month the report prints — the review month plus the next five, whether
 * or not data was uploaded for them. Months with no figures print as dashes so
 * a gap in the uploads is visible rather than silently dropped.
 */
export function windowMonths(asOfDate: string, reportMonth?: string | null): string[] {
  const start = windowStartMonth(asOfDate, reportMonth);
  return Array.from({ length: REPORT_WINDOW_MONTHS }, (_, i) => addMonths(start, i));
}

/** The months a report is allowed to display: review month + the next five. */
export function monthsInWindow(
  months: string[],
  asOfDate: string,
  reportMonth?: string | null,
): string[] {
  const start = windowStartMonth(asOfDate, reportMonth);
  const end = windowEndMonth(asOfDate, reportMonth);
  return (months ?? []).filter((key) => Boolean(key) && key >= start && key <= end);
}
