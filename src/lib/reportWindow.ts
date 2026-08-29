/**
 * Client mirror of `supabase/functions/_shared/reportWindow.ts` — keep both in
 * step. A revenue review shows the month it covers plus the next five; anything
 * further out is carried in the data but never displayed.
 */

export const REPORT_WINDOW_MONTHS = 6;

/**
 * Per-property window shape from `report_profile`. Most packs use the standard
 * six months opening on the review month; a client may print more months and/or
 * open on the month just closed.
 */
export interface ReportWindowOptions {
  /** Number of months printed. Defaults to `REPORT_WINDOW_MONTHS`. */
  months?: number | null;
  /** Months to shift the start relative to the review month. Defaults to 0. */
  startOffset?: number | null;
}

const windowLength = (options?: ReportWindowOptions): number => {
  const n = Number(options?.months);
  return Number.isFinite(n) && n >= 1 && n <= 24 ? Math.round(n) : REPORT_WINDOW_MONTHS;
};

const startOffsetOf = (options?: ReportWindowOptions): number => {
  const n = Number(options?.startOffset);
  return Number.isFinite(n) && n >= -6 && n <= 6 ? Math.round(n) : 0;
};


const addMonths = (key: string, delta: number): string => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
};

/**
 * The month a run reports on. An explicit `report_month` wins; otherwise a run
 * dated in the first days of a month covers the month just closed, and anything
 * later covers its own month.
 */
export function reportMonthAnchor(asOfDate: string, reportMonth?: string | null): string {
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
export function windowStartMonth(
  asOfDate: string,
  reportMonth?: string | null,
  options?: ReportWindowOptions,
): string {
  const anchor = reportMonthAnchor(asOfDate, reportMonth);
  const offset = startOffsetOf(options);
  return offset === 0 ? anchor : addMonths(anchor, offset);
}

export function windowEndMonth(
  asOfDate: string,
  reportMonth?: string | null,
  options?: ReportWindowOptions,
): string {
  return addMonths(
    windowStartMonth(asOfDate, reportMonth, options),
    windowLength(options) - 1,
  );
}

/** Every month the report prints, whether or not figures exist for it. */
export function windowMonths(
  asOfDate: string,
  reportMonth?: string | null,
  options?: ReportWindowOptions,
): string[] {
  const start = windowStartMonth(asOfDate, reportMonth, options);
  return Array.from({ length: windowLength(options) }, (_, i) => addMonths(start, i));
}

/** The months a report may display: review month + the next five. */
export function monthsInWindow(
  months: string[] | null | undefined,
  asOfDate: string,
  reportMonth?: string | null,
  options?: ReportWindowOptions,
): string[] {
  const start = windowStartMonth(asOfDate, reportMonth, options);
  const end = windowEndMonth(asOfDate, reportMonth, options);
  return (months ?? []).filter((key) => Boolean(key) && key >= start && key <= end);
}
