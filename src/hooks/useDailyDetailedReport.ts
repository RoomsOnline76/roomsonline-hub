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

  const build = useCallback(async (): Promise<DailyBuildResult> => {
    if (!runId) return { ok: false, message: "No run selected" };
    setIsBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke("cheetaplains-daily-report", {
        body: { run_id: runId },
      });
      if (error) {
        const failed = { ok: false, message: await readError(error) };
        setResult(failed);
        return failed;
      }
      if (data?.error) {
        const failed = { ok: false, message: String(data.error) };
        setResult(failed);
        return failed;
      }
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
  }, [runId, queryClient, storedDay]);

  return {
    build,
    isBuilding,
    result,
    storedDay: storedDay.data ?? null,
    isLoadingDay: storedDay.isLoading,
  };
}
