/**
 * Server mirror of `src/lib/reportProfile.ts`.
 *
 * Keep the two in step: the settings UI writes this shape and the Excel / draft
 * builders read it to decide which comparison columns a client's pack carries.
 */

export type ReportSourceMode = "pms_export" | "prior_workbook_only";
export type ReportYearColumn = "budget" | "target";

export interface ReportProfile {
  compare_years: number[];
  stly_from_prior_workbook: boolean;
  source_unavailable: boolean;
  source_mode: ReportSourceMode;
  year_columns: ReportYearColumn[];
}

export const EMPTY_REPORT_PROFILE: ReportProfile = {
  compare_years: [],
  stly_from_prior_workbook: false,
  source_unavailable: false,
  source_mode: "pms_export",
  year_columns: [],
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
    if (text === "budget" || text === "target") seen.add(text as ReportYearColumn);
  }
  return [...seen];
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
  };
};
