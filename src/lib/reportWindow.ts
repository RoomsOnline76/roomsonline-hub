/**
 * Client mirror of `supabase/functions/_shared/reportWindow.ts` — keep both in
 * step. A revenue review shows the month it covers plus the next five; anything
 * further out is carried in the data but never displayed.
 */

export const REPORT_WINDOW_MONTHS = 6;

const addMonths = (key: string, delta: number): string => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
};

/** `YYYY-MM` of the earliest month a run's window may contain. */
export function windowStartMonth(asOfDate: string): string {
  const iso = String(asOfDate ?? "").slice(0, 10);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return "0000-01";
  }
  const start = new Date(Date.UTC(year, month - 2, 1));
  return `${start.getUTCFullYear()}-${`${start.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

export function windowEndMonth(asOfDate: string): string {
  return addMonths(windowStartMonth(asOfDate), REPORT_WINDOW_MONTHS - 1);
}

/** The months a report may display: review month + the next five. */
export function monthsInWindow(
  months: string[] | null | undefined,
  asOfDate: string,
): string[] {
  const start = windowStartMonth(asOfDate);
  const end = windowEndMonth(asOfDate);
  return (months ?? []).filter((key) => Boolean(key) && key >= start && key <= end);
}
