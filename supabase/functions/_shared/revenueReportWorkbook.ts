// Source-shaped consolidated revenue-report workbooks.
// NightsBridge keeps the original Torburnlea layout; OPERA and PROTEL each get a
// workbook shaped like the client's own consolidated file (columns, headings and
// wording), so the revenue team is never handed a foreign format.
import { buildNightsbridgeWorkbook } from "./workbook/workbookNightsbridge.ts";
import { buildOperaWorkbook } from "./workbook/workbookOpera.ts";
import { buildProtelWorkbook, PROTEL_CARRY_FORWARD_SHEETS } from "./workbook/workbookProtel.ts";
import type { WorkbookOptions } from "./workbook/shared.ts";

export type {
  CarryForwardSheets,
  HistoricalBaseline,
  WorkbookExtras,
  WorkbookInputs,
  WorkbookOptions,
  WorkbookSnapshot,
} from "./workbook/shared.ts";
export { buildLayout, type ReportLayout } from "./workbook/workbookNightsbridge.ts";
export { PROTEL_CARRY_FORWARD_SHEETS };

export type ReportSourceType = "nightsbridge" | "opera" | "protel";

export const workbookSourceType = (value: unknown): ReportSourceType => {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("opera")) return "opera";
  if (raw.includes("protel")) return "protel";
  return "nightsbridge";
};

export async function buildRevenueWorkbook(options: WorkbookOptions): Promise<Uint8Array> {
  switch (workbookSourceType(options.extras?.sourceType)) {
    case "opera":
      return buildOperaWorkbook(options);
    case "protel":
      return buildProtelWorkbook(options);
    default:
      return buildNightsbridgeWorkbook(options);
  }
}
