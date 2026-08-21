import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * PROTEL adapter.
 *
 * The revenue source is the monthly "House State" Excel extract, which prints
 * one row per day with free/occupied rooms and revenue split into
 * accommodation, food & beverage and extras. Accommodation drives ADR and
 * occupancy; F&B and extras are carried as additional revenue and pre-fill the
 * reviewer's manual inputs.
 *
 * A run may also carry the "Company / Travel agent / Source Production" report.
 * It is not a revenue grid (its rows double-count across profiles) so it is used
 * only to split House State revenue proportionally across protel market codes.
 *
 * Properties flagged with the CheetaPlains report set add two bespoke owner
 * slides — bookings by nationality and top booking travel partners — built by
 * the `cheetaplains-special-reports` function from the Nationality workbook and
 * the protel reservation-list export.
 */
const EXPECTED_COLUMNS = [
  "date",
  "free",
  "occupied",
  "occupancy %",
  "arrivals",
  "departures",
  "accom.",
  "f&b",
  "extras",
  "total revenue",
];

const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  // F&B and extras arrive in the House State grid, so only Room 0 style
  // adjustments and complimentary nights are asked for.
  monthly: ["room0", "compRns"],
  narrative: ["minStay", "promotions", "rateOverrides", "commentary"],
};

export const protelAdapter: ReportSourceAdapter = {
  key: "protel",
  label: "PROTEL",
  description:
    "protel House State monthly extract (daily rooms and revenue), plus the optional Production report for the market-code split.",
  status: "ready",
  parserFunction: "protel-report-parser",
  reportTemplate: "protel",
  acceptedFileTypes: [".xlsx", ".xls"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
  notes:
    "Upload the monthly House State export. Nationality and reservation-list workbooks are kept aside for the specialised owner slides.",
};
