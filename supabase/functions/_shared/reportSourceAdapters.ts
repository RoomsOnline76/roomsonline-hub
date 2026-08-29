/**
 * Server-side mirror of `src/lib/report-adapters` (Design Brief §11).
 *
 * Edge functions use this to branch on a run's `source_type` without
 * duplicating strings: which parser owns the source, whether it can process
 * yet, and which final report template to render.
 *
 * Keep this file and the frontend registry in step.
 */

export type ReportSourceKey = "nightsbridge" | "opera" | "protel" | "roomraccoon";
export type ReportTemplate = "standard" | "protel";

export interface ReportSourceDescriptor {
  key: ReportSourceKey;
  label: string;
  status: "ready" | "planned";
  parserFunction: string;
  reportTemplate: ReportTemplate;
  notes?: string;
}

export const DEFAULT_REPORT_SOURCE: ReportSourceKey = "nightsbridge";

export const REPORT_SOURCES: Record<ReportSourceKey, ReportSourceDescriptor> = {
  nightsbridge: {
    key: "nightsbridge",
    label: "NightsBridge",
    status: "ready",
    parserFunction: "nightsbridge-report-parser",
    reportTemplate: "standard",
  },
  opera: {
    key: "opera",
    label: "OPERA",
    status: "ready",
    parserFunction: "opera-report-parser",
    reportTemplate: "standard",
  },
  protel: {
    key: "protel",
    label: "PROTEL",
    status: "ready",
    parserFunction: "protel-report-parser",
    reportTemplate: "protel",
  },
  roomraccoon: {
    key: "roomraccoon",
    label: "RoomRaccoon",
    status: "planned",
    parserFunction: "roomraccoon-report-parser",
    reportTemplate: "standard",
    notes:
      "RoomRaccoon parsing is not available yet — build these runs from the imported prior workbook.",
  },
};

export const isReportSourceKey = (value: unknown): value is ReportSourceKey =>
  typeof value === "string" && value in REPORT_SOURCES;

export const getReportSource = (key: string | null | undefined): ReportSourceDescriptor =>
  REPORT_SOURCES[isReportSourceKey(key) ? key : DEFAULT_REPORT_SOURCE];

export const isReportSourceReady = (key: string | null | undefined): boolean =>
  getReportSource(key).status === "ready";

/** Template a run's pack should use. Single switch point for the PROTEL divergence. */
export const reportTemplateFor = (key: string | null | undefined): ReportTemplate =>
  getReportSource(key).reportTemplate;
