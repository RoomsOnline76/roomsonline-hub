import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Imports a property's existing consolidated revenue report workbook into a run
 * so a first report has a previous-OTB baseline, last-year actuals, the manual
 * inputs and a historical grid without anyone retyping them.
 */

export interface PriorImportFound {
  previous_otb_months: number;
  previous_nights_months: number;
  last_year_months: number;
  last_year_nights_months: number;
  dinner_months: number;
  room0_months: number;
  comp_months: number;
  historical_revenue_months: number;
  historical_nights_months: number;
}

export interface PriorImportPreview {
  file: { id: string; filename: string };
  asOfDate: string | null;
  otbColumnLabel: string | null;
  months: string[];
  previousOtbRevenue: Record<string, number>;
  previousRoomNights: Record<string, number>;
  lastYearActual: Record<string, number>;
  lastYearRoomNights: Record<string, number>;
  dinnerByMonth: Record<string, number>;
  room0ByMonth: Record<string, number>;
  compRnsByMonth: Record<string, number>;
  historicalRevenue: Record<string, number>;
  historicalRoomNights: Record<string, number>;
  sheetsRead: string[];
  sheetsSkipped: string[];
  warnings: string[];
  found: PriorImportFound;
}

export interface PriorImportSelections {
  previousOtb: boolean;
  lastYear: boolean;
  additionalInputs: boolean;
  historical: boolean;
}

export interface PriorImportResult {
  ok: boolean;
  message?: string;
  preview?: PriorImportPreview;
  summary?: string[];
}

const numberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const mapPreview = (raw: Record<string, unknown>): PriorImportPreview => ({
  file: {
    id: String((raw.file as { id?: string } | undefined)?.id ?? ""),
    filename: String((raw.file as { filename?: string } | undefined)?.filename ?? "workbook"),
  },
  asOfDate: typeof raw.as_of_date === "string" ? raw.as_of_date : null,
  otbColumnLabel: typeof raw.otb_column_label === "string" ? raw.otb_column_label : null,
  months: strings(raw.months),
  previousOtbRevenue: numberMap(raw.previous_otb_revenue),
  previousRoomNights: numberMap(raw.previous_room_nights),
  lastYearActual: numberMap(raw.last_year_actual),
  lastYearRoomNights: numberMap(raw.last_year_room_nights),
  dinnerByMonth: numberMap(raw.dinner_by_month),
  room0ByMonth: numberMap(raw.room0_by_month),
  compRnsByMonth: numberMap(raw.comp_rns_by_month),
  historicalRevenue: numberMap(raw.historical_revenue),
  historicalRoomNights: numberMap(raw.historical_room_nights),
  sheetsRead: strings(raw.sheets_read),
  sheetsSkipped: strings(raw.sheets_skipped),
  warnings: strings(raw.warnings),
  found: (raw.found ?? {}) as PriorImportFound,
});

const readError = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const parsed = JSON.parse(await error.context.text());
      return typeof parsed?.error === "string" ? parsed.error : JSON.stringify(parsed);
    } catch {
      return error.message;
    }
  }
  return error instanceof Error ? error.message : "Unknown error";
};

export function useReportPriorImport(runId: string | undefined) {
  const queryClient = useQueryClient();
  const [isWorking, setIsWorking] = useState(false);
  const [preview, setPreview] = useState<PriorImportPreview | null>(null);

  const call = useCallback(
    async (body: Record<string, unknown>): Promise<PriorImportResult> => {
      if (!runId) return { ok: false, message: "No run selected" };
      setIsWorking(true);
      try {
        const { data, error } = await supabase.functions.invoke("report-prior-workbook-import", {
          body: { run_id: runId, ...body },
        });
        if (error) return { ok: false, message: await readError(error) };
        if (data?.error) return { ok: false, message: String(data.error) };
        const mapped = data?.preview ? mapPreview(data.preview as Record<string, unknown>) : undefined;
        if (mapped) setPreview(mapped);
        return { ok: true, preview: mapped, summary: strings(data?.summary) };
      } finally {
        setIsWorking(false);
      }
    },
    [runId],
  );

  /** Read the uploaded workbook and show what it holds — writes nothing. */
  const inspect = useCallback(() => call({ apply: false }), [call]);

  const apply = useCallback(
    async (selections: PriorImportSelections, replaceExisting: boolean) => {
      const result = await call({
        apply: true,
        replace_existing: replaceExisting,
        selections: {
          previous_otb: selections.previousOtb,
          last_year: selections.lastYear,
          additional_inputs: selections.additionalInputs,
          historical: selections.historical,
        },
      });
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ["reports"] });
      return result;
    },
    [call, queryClient],
  );

  return { inspect, apply, preview, isWorking };
}
