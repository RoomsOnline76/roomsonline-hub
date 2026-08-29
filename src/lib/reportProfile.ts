/**
 * Source-agnostic report *presentation* profile.
 *
 * Some owners compare against more than "previous review + last year": Hotel
 * Krige prints 2025 and 2024 actuals plus same-time-last-year, Les Chambres has
 * no downloadable PMS extract at all, Mziki takes STLY from the pack that was
 * emailed same-time-last-year.
 *
 * All of that is configuration on `property_report_settings.report_profile` —
 * never a new report source key and never a property-name special case in a
 * parser. An empty profile means exactly today's behaviour.
 */

export type ReportSourceMode = "ledger" | "prior_workbook_only";

export interface ReportProfile {
  /** Calendar years printed as actuals beside the current OTB column. */
  compare_years: number[];
  /** Use the imported prior owner workbook as same-time-last-year OTB. */
  stly_from_prior_workbook: boolean;
  /** No PMS extract can be downloaded — the last sent pack is the source. */
  source_unavailable: boolean;
  source_mode: ReportSourceMode;
  /** Extra Excel columns / draft variance rows per compare year and for STLY. */
  year_columns: boolean;
}

export const EMPTY_REPORT_PROFILE: ReportProfile = {
  compare_years: [],
  stly_from_prior_workbook: false,
  source_unavailable: false,
  source_mode: "ledger",
  year_columns: false,
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

/** Tolerant read of whatever is stored on the settings row. */
export function parseReportProfile(value: unknown): ReportProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_REPORT_PROFILE };
  const raw = value as Record<string, unknown>;
  const mode: ReportSourceMode =
    raw.source_mode === "prior_workbook_only" ? "prior_workbook_only" : "ledger";
  const sourceUnavailable = Boolean(raw.source_unavailable);
  return {
    compare_years: yearList(raw.compare_years),
    stly_from_prior_workbook: Boolean(raw.stly_from_prior_workbook),
    source_unavailable: sourceUnavailable,
    // A property with no extract can only run off the prior workbook.
    source_mode: sourceUnavailable ? "prior_workbook_only" : mode,
    year_columns: Boolean(raw.year_columns),
  };
}

/** True when nothing on the profile would change a run. */
export function isEmptyReportProfile(profile: ReportProfile): boolean {
  return (
    profile.compare_years.length === 0 &&
    !profile.stly_from_prior_workbook &&
    !profile.source_unavailable &&
    profile.source_mode === "ledger" &&
    !profile.year_columns
  );
}

/** The prior-workbook import stops being optional in these two cases. */
export function requiresPriorWorkbook(profile: ReportProfile): boolean {
  return profile.stly_from_prior_workbook || profile.source_mode === "prior_workbook_only";
}
