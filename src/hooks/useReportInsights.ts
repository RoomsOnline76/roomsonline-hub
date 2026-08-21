import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type InsightSeverity = "high" | "medium" | "low";

export interface InsightFlag {
  id: string;
  severity: InsightSeverity;
  month: string | null;
  metric: string;
  value: number;
  comparison: number;
  delta: number;
  deltaPct: number | null;
  factText: string;
  note?: string | null;
}

export type SuggestionField =
  | "min_stay_notes"
  | "promotions_notes"
  | "rate_override_notes"
  | "free_commentary";

export interface ReportInsights {
  narrative: string | null;
  flags: InsightFlag[];
  suggestions: Partial<Record<SuggestionField, string>>;
  chartRecommendation: string | null;
  generatedAt: string | null;
}

const readError = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const parsed = JSON.parse(await error.context.text());
      if (typeof parsed?.error === "string") return parsed.error;
      return JSON.stringify(parsed?.error ?? parsed);
    } catch {
      return error.message;
    }
  }
  return error instanceof Error ? error.message : "Unknown error";
};

/** Saved insights for a run, plus generation and accept-suggestion actions. */
export function useReportInsights(runId: string | undefined) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const query = useQuery({
    queryKey: ["reports", "insights", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<ReportInsights | null> => {
      if (!runId) return null;
      const { data, error } = await supabase
        .from("report_insights")
        .select("narrative, flags, suggestions, chart_recommendation, generated_at")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        narrative: data.narrative ?? null,
        flags: Array.isArray(data.flags) ? (data.flags as unknown as InsightFlag[]) : [],
        suggestions: (data.suggestions ?? {}) as ReportInsights["suggestions"],
        chartRecommendation: data.chart_recommendation ?? null,
        generatedAt: data.generated_at ?? null,
      };
    },
  });

  const generate = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!runId) return { ok: false, message: "No run selected" };
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("reports-xai-insights", {
        body: { run_id: runId, action: "generate" },
      });
      if (error) return { ok: false, message: await readError(error) };
      if (data?.error) return { ok: false, message: String(data.error) };
      return { ok: true };
    } finally {
      setIsGenerating(false);
      await queryClient.invalidateQueries({ queryKey: ["reports", "insights", runId] });
    }
  }, [runId, queryClient]);

  const acceptSuggestion = useMutation({
    mutationFn: async ({ field, text }: { field: SuggestionField; text: string }) => {
      if (!runId) throw new Error("No run selected");
      const { error } = await supabase
        .from("report_additional_inputs")
        .upsert({ run_id: runId, [field]: text }, { onConflict: "run_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reports", "additional-inputs", runId] });
    },
  });

  return {
    insights: query.data ?? null,
    isLoading: query.isLoading,
    generate,
    isGenerating,
    acceptSuggestion,
  };
}
