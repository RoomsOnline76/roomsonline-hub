import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** One business day of Cheetah Plains figures, as stored on the run. */
export interface DailyPeriodFigures {
  revenue: number;
  nights: number;
  capacity: number;
  occupancy: number | null;
  adr: number | null;
}

export interface DailyMovement {
  count: number;
  value: number | null;
  nights: number | null;
  period: { from: string; to: string } | null;
}

export interface DailyFigures {
  date: string;
  villasOccupied: number;
  villasFree: number;
  arrivals: number;
  departures: number;
  occupancy: number | null;
  accommodation: number;
  foodAndBeverage: number;
  extras: number;
  total: number;
  adr: number | null;
  monthToDate: DailyPeriodFigures;
  monthOnBooks: DailyPeriodFigures;
  enquiries: { revenue: number; nights: number } | null;
  created: DailyMovement | null;
  cancelled: DailyMovement | null;
  villaCount: number | null;
}

export interface DailyBuildResult {
  ok: boolean;
  message?: string;
  figures?: DailyFigures;
  daysInWorkbook?: number;
  excelUrl?: string;
  reportUrl?: string;
  documentTitle?: string;
}

/** Where the stepped read has got to, so the wizard can show progress. */
export interface DailyBuildProgress {
  read: number;
  total: number;
}

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

/**
 * Builds the Daily Detailed Report for a run: reads the day's uploads, stores
 * the day, refreshes the property's running workbook and the branded one-pager.
 */
export function useDailyDetailedReport(
  runId: string | undefined,
  propertyId: string | undefined,
  asOfDate: string | undefined,
) {
  const queryClient = useQueryClient();
  const [isBuilding, setIsBuilding] = useState(false);
  const [result, setResult] = useState<DailyBuildResult | null>(null);
  const [progress, setProgress] = useState<DailyBuildProgress | null>(null);

  const storedDay = useQuery({
    queryKey: ["reports", "daily-day", propertyId, asOfDate],
    enabled: Boolean(propertyId && asOfDate),
    queryFn: async (): Promise<DailyFigures | null> => {
      if (!propertyId || !asOfDate) return null;
      const { data, error } = await supabase
        .from("report_daily_days")
        .select("figures")
        .eq("property_id", propertyId)
        .eq("report_date", asOfDate.slice(0, 10))
        .maybeSingle();
      if (error) throw error;
      const figures = data?.figures as unknown as DailyFigures | undefined;
      return figures && typeof figures.date === "string" ? figures : null;
    },
  });

  const emailText = useQuery({
    queryKey: ["reports", "daily-email", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<string> => {
      if (!runId) return "";
      const { data, error } = await supabase
        .from("report_additional_inputs")
        .select("free_commentary")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      return data?.free_commentary ?? "";
    },
  });

  const saveEmailText = useCallback(
    async (text: string): Promise<{ ok: boolean; message?: string }> => {
      if (!runId) return { ok: false, message: "No run selected" };
      const { error } = await supabase
        .from("report_additional_inputs")
        .upsert({ run_id: runId, free_commentary: text.trim() || null }, { onConflict: "run_id" });
      if (error) return { ok: false, message: error.message };
      await emailText.refetch();
      return { ok: true };
    },
    [runId, emailText],
  );

  /** One call to the function; returns the parsed body or a failure message. */
  const call = useCallback(
    async (
      body: Record<string, unknown>,
    ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> => {
      const { data, error } = await supabase.functions.invoke("cheetaplains-daily-report", {
        body,
      });
      if (error) return { ok: false, message: await readError(error) };
      if (data?.error) return { ok: false, message: String(data.error) };
      return { ok: true, data: (data ?? {}) as Record<string, unknown> };
    },
    [],
  );

  /**
   * Reads the day's files a few at a time — a day carries around twenty exports
   * and reading them in one call exhausts the worker — then builds the pack.
   */
  const build = useCallback(async (): Promise<DailyBuildResult> => {
    if (!runId) return { ok: false, message: "No run selected" };
    setIsBuilding(true);
    setProgress(null);
    try {
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 40) {
          const failed = { ok: false, message: "Reading the files did not finish" };
          setResult(failed);
          return failed;
        }
        const batch = await call({ run_id: runId, mode: "parse_batch", reset: guard === 1 });
        if (!batch.ok) {
          setResult(batch);
          return batch;
        }
        const read = Number(batch.data.read) || 0;
        const total = Number(batch.data.total) || 0;
        setProgress({ read, total });
        if ((Number(batch.data.remaining) || 0) === 0) break;
      }

      const finished = await call({ run_id: runId, mode: "build" });
      if (!finished.ok) {
        setResult(finished);
        return finished;
      }
      const data = finished.data;
      const built: DailyBuildResult = {
        ok: true,
        figures: data?.figures as DailyFigures | undefined,
        daysInWorkbook: Number(data?.days_in_workbook) || undefined,
        excelUrl: data?.excel_url ? String(data.excel_url) : undefined,
        reportUrl: data?.report_url ? String(data.report_url) : undefined,
        documentTitle: data?.document_title ? String(data.document_title) : undefined,
      };
      setResult(built);
      return built;
    } finally {
      setIsBuilding(false);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await storedDay.refetch();
    }
  }, [runId, queryClient, storedDay, call]);

  return {
    build,
    isBuilding,
    progress,
    result,
    storedDay: storedDay.data ?? null,
    isLoadingDay: storedDay.isLoading,
    emailText: emailText.data ?? "",
    saveEmailText,
  };
}
