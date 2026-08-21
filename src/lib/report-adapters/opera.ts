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
 * Complimentary and house-use nights are read straight off the grid, so the
 * reviewer is only asked for revenue that lives outside the rooms ledger.
 */
const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [
    {
      key: "dinner_by_month",
      label: "Dinner revenue",
      hint: "Food & beverage captured outside the rooms ledger.",
      kind: "currency",
    },
    {
      key: "room0_by_month",
      label: "Other non-rooms revenue",
      hint: "Conference, spa or sundry revenue not shown on the OPERA rooms grid.",
      kind: "currency",
    },
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
