import type { AdditionalFieldConfig, ReportSourceAdapter } from "./types";

/**
 * RoomRaccoon adapter (Les Chambres).
 *
 * The revenue source is RoomRaccoon's monthly "Revenue report" PDF, which
 * prints one row per business date with rooms sold, occupancy, room revenue and
 * ADR, plus a month total row used to reconcile the parsed grid.
 *
 * Parsing is not wired yet — runs for this source are built from the client's
 * prior workbook through the report profile's `prior_workbook_only` mode.
 */
const EXPECTED_COLUMNS = [
  "date",
  "rooms sold",
  "occupancy %",
  "room revenue",
  "adr",
  "total revenue",
];

const ADDITIONAL_FIELDS: AdditionalFieldConfig = {
  monthly: [
    {
      key: "dinner_by_month",
      label: "Food and beverage revenue",
      hint: "Breakfast and restaurant revenue not carried on the rooms grid.",
      kind: "currency",
    },
    {
      key: "comp_rns_by_month",
      label: "Complimentary room nights",
      hint: "Room nights given at no charge.",
      kind: "count",
    },
  ],
  narrative: ["minStay", "promotions", "commentary"],
};

export const roomraccoonAdapter: ReportSourceAdapter = {
  key: "roomraccoon",
  label: "RoomRaccoon",
  description:
    "RoomRaccoon monthly revenue report (daily rooms sold, occupancy, room revenue and ADR).",
  status: "planned",
  parserFunction: "roomraccoon-report-parser",
  reportTemplate: "standard",
  acceptedFileTypes: [".pdf", ".xlsx"],
  getExpectedColumns: () => [...EXPECTED_COLUMNS],
  getDefaultAdditionalFields: () => ADDITIONAL_FIELDS,
  notes:
    "RoomRaccoon parsing is not available yet — build these runs from the imported prior workbook.",
};
