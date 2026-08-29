/**
 * Server mirror of `src/lib/reportProfile.ts` — the per-property report
 * presentation profile stored on `property_report_settings.report_profile`.
 *
 * Empty profile = today's behaviour. No parser may branch on a property name.
 */

export type ReportSourceMode = "ledger" | "prior_workbook_only";

export interface ReportProfile {
  compare_years: number[];
  stly_from_prior_workbook: boolean;
  source_unavailable: boolean;
  source_mode: ReportSourceMode;
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
    source_mode: sourceUnavailable ? "prior_workbook_only" : mode,
    year_columns: Boolean(raw.year_columns),
  };
}

export function isEmptyReportProfile(profile: ReportProfile): boolean {
  return (
    profile.compare_years.length === 0 &&
    !profile.stly_from_prior_workbook &&
    !profile.source_unavailable &&
    profile.source_mode === "ledger" &&
    !profile.year_columns
  );
}

export function requiresPriorWorkbook(profile: ReportProfile): boolean {
  return profile.stly_from_prior_workbook || profile.source_mode === "prior_workbook_only";
}
