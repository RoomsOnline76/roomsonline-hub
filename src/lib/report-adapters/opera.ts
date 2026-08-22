import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * OPERA adapter — Oracle OPERA "History and Forecast" monthly PDF extracts.
 *
 * Unlike NightsBridge, OPERA does not export a booking ledger: each PDF is a
 * daily grid (one row per business date). The `opera-report-parser` edge
 * function reads that grid, reconciles it against the printed Total row and
 * turns it into the same normalised ledger the shared aggregation engine
 * consumes, so the Excel pack and the visual report are unchanged.
 *
 * The "columns" below are the grid's headings — they exist so the readiness
 * checklist and the wizard can tell the user what the file must contain.
 */
const EXPECTED_COLUMNS = [
  "date",
  "total occ",
  "arr. rooms",
  "comp. rooms",
  "house use",
  "deduct indiv.",
  "non-ded. indiv.",
  "deduct group",
  "non-ded. group",
  "occ.%",
  "room revenue",
  "average rate",
];

/**
 * OPERA reports carry rooms revenue only — the reference consolidated workbook
 * has no Dinner, Room 0 or Additional revenue columns, so none are collected or
 * printed. Complimentary and house-use nights come straight off the grid and are
 * the single monthly override a reviewer may need.
 */
const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [
    {
      key: "comp_rns_by_month",
      label: "Complimentary room nights",
      hint: "Pre-filled from the Comp. and House Use columns — override only if needed.",
      kind: "count",
    },
  ],
  narrative: ["minStay", "promotions", "rateOverrides", "commentary"],
};

export const operaAdapter: ReportSourceAdapter = {
  key: "opera",
  label: "OPERA",
  description: "Oracle OPERA monthly History and Forecast PDF extracts (one per month).",
  status: "ready",
  parserFunction: "opera-report-parser",
  reportTemplate: "standard",
  acceptedFileTypes: [".pdf"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
  notes:
    "Upload one History and Forecast PDF per month. The extract must carry a text layer — scanned printouts cannot be read.",
};
