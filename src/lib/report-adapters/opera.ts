import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * OPERA adapter — stub (Phase 8).
 *
 * Sample exports live in `docs/reference/opera/`. The column list below is a
 * best guess taken from those samples and MUST be confirmed against the real
 * `opera-report-parser` before this adapter is flipped to `ready`.
 */
const EXPECTED_COLUMNS = [
  "confirmation no",
  "arrival",
  "departure",
  "nights",
  "room type",
  "room revenue",
  "total revenue",
  "market segment",
  "source code",
  "reservation status",
  "currency",
];

const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [],
  narrative: ["minStay", "promotions", "rateOverrides", "commentary"],
};

export const operaAdapter: ReportSourceAdapter = {
  key: "opera",
  label: "OPERA",
  description: "Oracle OPERA PMS reservation and revenue extracts.",
  status: "planned",
  parserFunction: "opera-report-parser",
  reportTemplate: "standard",
  acceptedFileTypes: [".xlsx", ".xls", ".csv"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
  notes:
    "OPERA parsing is not available yet — the opera-report-parser edge function and its column mapping still have to be built.",
};
