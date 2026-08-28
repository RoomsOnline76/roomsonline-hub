import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAdapter, unsupportedSourceMessage } from "@/lib/report-adapters";
import type { DerivedMonthlyInputs } from "@/components/reports/ManualInputsCard";
import type { ExcludedRowsPayload } from "@/components/reports/ExcludedRowsCard";

/** Booking-behaviour figures derived from the uploaded ledger. */
export interface BookingTrends {
  alos: number;
  alosByMonth: Record<string, number>;
  bookings: number;
  arrivalWeekdays: number[];
  bookedWeekdays: number[];
  leadTimeBuckets: Record<string, number>;
  leadTimeAvg: number | null;
  leadTimeMedian: number | null;
  hasBookedDates: boolean;
}

export interface ReportSnapshot {
  runId: string;
  months: string[];
  otbRevenue: Record<string, number>;
  previousOtbRevenue: Record<string, number>;
  lastYearActual: Record<string, number>;
  roomNights: Record<string, number>;
  previousRoomNights: Record<string, number>;
  lastYearRoomNights: Record<string, number>;
  capacityDays: Record<string, number>;
  additionalRevenue: Record<string, number>;
  sourceBreakdown: Record<string, { revenue: number; nights: number }>;
  nonSellable: Record<string, { revenue: number; nights: number; rows: number }>;
  /** Dinner / Room 0 / Comp RN figures calculated from the export. */
  derivedInputs: DerivedMonthlyInputs | null;
  /** Every row the parser set aside, grouped by month, plus keep-list hits. */
  excludedRows: ExcludedRowsPayload | null;
  adr: Record<string, number>;
  occupancy: Record<string, number>;
  roomCount: number | null;
  bookingTrends: BookingTrends | null;
  totals: {
    revenue?: number;
    nights?: number;
    capacity_days?: number;
    adr?: number;
    occupancy?: number;
    extras?: number;
    bookings?: number;
    non_sellable_rows?: number;
  };
}

const asNumberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

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

export interface ProcessResult {
  ok: boolean;
  message?: string;
  rowsParsed?: number;
  months?: string[];
  /** True when the parser stopped on its time budget with work still pending. */
  partial?: boolean;
  filesParsed?: number;
  filesPending?: number;
}

export interface ExcelResult {
  ok: boolean;
  message?: string;
  url?: string;
}

const weekdayArray = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length !== 7) return [0, 0, 0, 0, 0, 0, 0];
  return value.map((entry) => Number(entry) || 0);
};

/** Reads the parser's booking-trend block; null when the run has none. */
const readBookingTrends = (value: unknown): BookingTrends | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const bookings = Number(raw.bookings ?? 0) || 0;
  if (bookings === 0) return null;
  return {
    alos: Number(raw.alos ?? 0) || 0,
    alosByMonth: asNumberMap(raw.alos_by_month),
    bookings,
    arrivalWeekdays: weekdayArray(raw.arrival_weekdays),
    bookedWeekdays: weekdayArray(raw.booked_weekdays),
    leadTimeBuckets: asNumberMap(raw.lead_time_buckets),
    leadTimeAvg: raw.lead_time_avg === null ? null : Number(raw.lead_time_avg) || null,
    leadTimeMedian: raw.lead_time_median === null ? null : Number(raw.lead_time_median) || null,
    hasBookedDates: raw.has_booked_dates === true,
  };
};

/** Computed snapshot for a run. */
export function useReportSnapshot(runId: string | undefined) {
  const query = useQuery({
    queryKey: ["reports", "snapshot", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<ReportSnapshot | null> => {
      if (!runId) return null;
      const { data, error } = await supabase
        .from("report_snapshots")
        .select("*")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        runId,
        months: Array.isArray(data.months) ? (data.months as string[]) : [],
        otbRevenue: asNumberMap(data.otb_revenue),
        previousOtbRevenue: asNumberMap(data.previous_otb_revenue),
        lastYearActual: asNumberMap(data.last_year_actual),
        roomNights: asNumberMap(data.room_nights),
        previousRoomNights: asNumberMap(data.previous_room_nights),
        lastYearRoomNights: asNumberMap(data.last_year_room_nights),
        capacityDays: asNumberMap(data.capacity_days),
        additionalRevenue: asNumberMap(data.additional_revenue),
        sourceBreakdown: (data.source_breakdown ?? {}) as ReportSnapshot["sourceBreakdown"],
        nonSellable: (data.non_sellable ?? {}) as ReportSnapshot["nonSellable"],
        derivedInputs: (data.derived_inputs ?? null) as DerivedMonthlyInputs | null,
        excludedRows: (data.excluded_rows ?? null) as ExcludedRowsPayload | null,
        adr: asNumberMap(data.adr),
        occupancy: asNumberMap(data.occupancy),
        roomCount: data.room_count ?? null,
        bookingTrends: readBookingTrends(data.booking_trends),
        totals: (data.totals ?? {}) as ReportSnapshot["totals"],
      };
    },
  });

  return {
    snapshot: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/** Runs the parser + aggregator for a run. */
export function useProcessReportRun(runId: string | undefined, sourceType?: string) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Re-parses the whole run, or a single stored file when `fileId` is given so
   * one bad workbook can be retried without re-reading every other file.
   * `mapping` carries a reviewer-confirmed column map for that one file.
   */
  const process = useCallback(async (
    fileId?: string,
    mapping?: Record<string, number> | null,
    sheet?: string | null,
  ): Promise<ProcessResult> => {
    if (!runId) return { ok: false, message: "No run selected" };
    const adapter = getAdapter(sourceType);
    // Stub adapters (OPERA / PROTEL) have no parser deployed yet — fail clearly
    // instead of invoking a function that does not exist.
    if (adapter.status !== "ready") {
      return { ok: false, message: unsupportedSourceMessage(sourceType) };
    }
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke(adapter.parserFunction, {
        body: fileId
          ? { run_id: runId, file_id: fileId, ...(mapping ? { mapping, sheet: sheet ?? null } : {}) }
          : { run_id: runId },
      });

      if (error) {
        const message = await readError(error);
        // A time-budget stop comes back as 422 with a "run again to continue" note.
        return { ok: false, message, partial: /time limit/i.test(message) };
      }
      if (data?.error) {
        return { ok: false, message: String(data.error), partial: Boolean(data?.partial) };
      }
      return {
        ok: true,
        rowsParsed: Number(data?.rows_parsed ?? 0),
        months: Array.isArray(data?.months) ? (data.months as string[]) : [],
        partial: data?.status === "partial" || Boolean(data?.partial),
        filesParsed: Number(data?.files_parsed ?? 0),
        filesPending: Number(data?.files_pending ?? 0),
      };
    } finally {
      setIsProcessing(false);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  }, [runId, sourceType, queryClient]);

  return { process, isProcessing };
}

/** Generates and downloads the consolidated workbook. */
export function useReportExcel(runId: string | undefined) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (): Promise<ExcelResult> => {
    if (!runId) return { ok: false, message: "No run selected" };
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-report-excel", {
        body: { run_id: runId },
      });
      if (error) return { ok: false, message: await readError(error) };
      if (data?.error) return { ok: false, message: String(data.error) };
      if (!data?.url) return { ok: false, message: "No download link returned" };
      return { ok: true, url: String(data.url) };
    } finally {
      setIsGenerating(false);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  }, [runId, queryClient]);

  return { generate, isGenerating };
}
