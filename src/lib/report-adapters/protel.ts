import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * PROTEL adapter — stub (Phase 8).
 *
 * Sample exports live in `docs/reference/protel/`. PROTEL also ships a
 * different final report layout (`reportTemplate: "protel"`): different page
 * order and metric emphasis, including nationality and booking-partner pages.
 */
const EXPECTED_COLUMNS = [
  "reservation no",
  "arrival",
  "departure",
  "nights",
  "unit",
  "accommodation revenue",
  "extras",
  "commission",
  "net revenue",
  "nationality",
  "travel agent",
  "status",
  "currency",
];

const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [],
  narrative: ["minStay", "promotions", "rateOverrides", "commentary"],
};

export const protelAdapter: ReportSourceAdapter = {
  key: "protel",
  label: "PROTEL",
  description: "protel PMS revenue, nationality and booking-partner extracts.",
  status: "planned",
  parserFunction: "protel-report-parser",
  reportTemplate: "protel",
  acceptedFileTypes: [".xlsx", ".xls", ".csv"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
  notes:
    "PROTEL parsing is not available yet — it needs the protel-report-parser edge function plus the divergent PROTEL report template.",
};
