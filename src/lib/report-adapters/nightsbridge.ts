import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * Columns mirrored from `supabase/functions/nightsbridge-report-parser`
 * (`COLUMN_ALIASES` / `REQUIRED`). Keep the two in step when the parser's
 * aliases change.
 */
const EXPECTED_COLUMNS = [
  "booking id",
  "arrival date",
  "last night",
  "nights",
  "revenue",
  "extras",
  "commission",
  "nett",
  "room name",
  "source",
  "status",
  "type",
  "currency",
];

const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [
    {
      key: "dinner_by_month",
      label: "Dinner revenue",
      hint: "Food & beverage captured outside the booking ledger.",
      kind: "currency",
    },
    {
      key: "room0_by_month",
      label: "Room 0 revenue",
      hint: "Revenue booked against the non-sellable Room 0 placeholder.",
      kind: "currency",
    },
    {
      key: "comp_rns_by_month",
      label: "Complimentary room nights",
      hint: "Room nights given away — excluded from ADR.",
      kind: "count",
    },
  ],
  narrative: ["minStay", "promotions", "rateOverrides", "commentary"],
};

export const nightsbridgeAdapter: ReportSourceAdapter = {
  key: "nightsbridge",
  label: "NightsBridge",
  description: "NightsBridge bookingsummary workbook exports (one per period).",
  status: "ready",
  parserFunction: "nightsbridge-report-parser",
  reportTemplate: "standard",
  acceptedFileTypes: [".xlsx", ".xls"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
};
