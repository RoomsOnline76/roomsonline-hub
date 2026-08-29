/**
 * Per-property report profile.
 *
 * Clients do not all compare against the same yardstick: some want two or three
 * calendar years beside the on-the-books column, some compare against the report
 * that was sent same-time-last-year, some carry a budget column, and a few have
 * no usable PMS export at all so the whole grid has to be rebuilt from the last
 * workbook we sent them.
 *
 * All of that is configuration on `property_report_settings.report_profile` —
 * never a new source key and never a property name special-case in a builder.
 */

/** Where a run's revenue grid comes from. */
export type ReportSourceMode = "pms_export" | "prior_workbook_only";

/** Named extra columns beyond calendar-year actuals. */
export type ReportYearColumn = "budget" | "target";

export interface ReportProfile {
  /** Calendar years printed as extra comparison columns, newest first. */
  compare_years: number[];
  /** Use the imported prior workbook's OTB column as same-time-last-year. */
  stly_from_prior_workbook: boolean;
  /** The property's PMS export is not available for this client. */
  source_unavailable: boolean;
  /** How the grid is assembled. */
  source_mode: ReportSourceMode;
  /** Extra named columns, e.g. the client's own budget. */
  year_columns: ReportYearColumn[];
  /**
   * How many months the printed window covers. `null` keeps the standard six.
   * Cathedral Peak's pack prints eight.
   */
  window_months: number | null;
  /**
   * Months to shift the window start relative to the review month. `-1` opens the
   * grid on the month just closed (Cathedral Peak), `0` is the standard start.
   */
  window_start_offset: number;
  /**
   * Growth percentage applied to last year's actuals to derive the Target column
   * when the client does not supply their own targets. `10` = last year + 10%.
   */
  target_growth_pct: number | null;
}

export const EMPTY_REPORT_PROFILE: ReportProfile = {
  compare_years: [],
  stly_from_prior_workbook: false,
  source_unavailable: false,
  source_mode: "pms_export",
  year_columns: [],
  window_months: null,
  window_start_offset: 0,
  target_growth_pct: null,
};

const yearList = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const entry of value) {
    const year = Number(entry);
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) seen.add(year);
  }
  return [...seen].sort((a, b) => b - a);
};

const columnList = (value: unknown): ReportYearColumn[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ReportYearColumn>();
  for (const entry of value) {
    const text = String(entry ?? "").trim().toLowerCase();
    if (text === "budget" || text === "target") seen.add(text);
  }
  return [...seen];
};


const boundedInt = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
};

const boundedNumber = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

export const parseReportProfile = (value: unknown): ReportProfile => {
  if (!value || typeof value !== "object") return { ...EMPTY_REPORT_PROFILE };
  const raw = value as Record<string, unknown>;
  const mode = String(raw.source_mode ?? "pms_export");
  return {
    compare_years: yearList(raw.compare_years),
    stly_from_prior_workbook: Boolean(raw.stly_from_prior_workbook),
    source_unavailable: Boolean(raw.source_unavailable),
    source_mode: mode === "prior_workbook_only" ? "prior_workbook_only" : "pms_export",
    year_columns: columnList(raw.year_columns),
    window_months: boundedInt(raw.window_months, 1, 24),
    window_start_offset: boundedInt(raw.window_start_offset, -6, 6) ?? 0,
    target_growth_pct: boundedNumber(raw.target_growth_pct, -100, 500),
  };
};

/** Window shape for `reportWindow.ts`, so callers never re-read the raw JSON. */
export const reportWindowOptions = (
  profile: ReportProfile,
): { months?: number | null; startOffset?: number | null } => ({
  months: profile.window_months,
  startOffset: profile.window_start_offset,
});

/** True when nothing in the profile deviates from the standard pack. */
export const isDefaultReportProfile = (profile: ReportProfile): boolean =>
  profile.compare_years.length === 0 &&
  !profile.stly_from_prior_workbook &&
  !profile.source_unavailable &&
  profile.source_mode === "pms_export" &&
  profile.year_columns.length === 0 &&
  profile.window_months === null &&
  profile.window_start_offset === 0 &&
  profile.target_growth_pct === null;

