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

export interface InsightSelection {
  include: boolean;
  text: string;
}

/** TOBI's freer "consultant" second opinion, produced by the experimental pass. */
export interface ExperimentalInsights {
  headline: string | null;
  flagNotes: Record<string, string>;
  suggestions: Partial<Record<SuggestionField, string>>;
  /** Why the second opinion is missing, when it could not be produced. */
  error: string | null;
  generatedAt: string | null;
}

export interface ReportInsights {
  narrative: string | null;
  /** Reviewer-edited narrative; falls back to `narrative` when unset. */
  narrativeFinal: string | null;
  includeNarrative: boolean;
  /** Keyed by suggestion field / flag id — inclusion flag plus final wording. */
  selections: Record<string, InsightSelection>;
  flags: InsightFlag[];
  suggestions: Partial<Record<SuggestionField, string>>;
  chartRecommendation: string | null;
  /** Extra slides/screenshots TOBI read for this generation. */
  slidesConsidered: { count: number; titles: string[] };
  experimental: ExperimentalInsights;
  generatedAt: string | null;
}

/** Selection key namespace so experimental ticks never collide with conservative ones. */
export const experimentalKey = (key: string): string => `exp:${key}`;

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
        .select(
          "narrative, narrative_final, include_narrative, selections, flags, suggestions, chart_recommendation, slides_considered, experimental, experimental_generated_at, experimental_error, generated_at",
        )
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const slides = (data.slides_considered ?? {}) as { count?: number; titles?: unknown };
      const exp = (data.experimental ?? {}) as {
        headline?: unknown;
        flag_notes?: unknown;
        suggestions?: unknown;
      };
      const stringMap = (value: unknown): Record<string, string> => {
        if (!value || typeof value !== "object") return {};
        const out: Record<string, string> = {};
        for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
          if (typeof raw === "string" && raw.trim()) out[key] = raw;
        }
        return out;
      };
      return {
        narrative: data.narrative ?? null,
        narrativeFinal: data.narrative_final ?? null,
        includeNarrative: data.include_narrative !== false,
        selections: (data.selections ?? {}) as unknown as Record<string, InsightSelection>,
        flags: Array.isArray(data.flags) ? (data.flags as unknown as InsightFlag[]) : [],
        suggestions: (data.suggestions ?? {}) as ReportInsights["suggestions"],
        chartRecommendation: data.chart_recommendation ?? null,
        slidesConsidered: {
          count: Number(slides.count ?? 0) || 0,
          titles: Array.isArray(slides.titles) ? slides.titles.map(String) : [],
        },
        experimental: {
          headline: typeof exp.headline === "string" ? exp.headline : null,
          flagNotes: stringMap(exp.flag_notes),
          suggestions: stringMap(exp.suggestions) as ReportInsights["suggestions"],
          error: data.experimental_error ?? null,
          generatedAt: data.experimental_generated_at ?? null,
        },
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

  /** Persists the reviewer's tick boxes and edited wording. */
  const saveReview = useMutation({
    mutationFn: async (patch: {
      narrativeFinal?: string | null;
      includeNarrative?: boolean;
      selections?: Record<string, InsightSelection>;
    }) => {
      if (!runId) throw new Error("No run selected");
      const row: Record<string, unknown> = { run_id: runId };
      if (patch.narrativeFinal !== undefined) row.narrative_final = patch.narrativeFinal;
      if (patch.includeNarrative !== undefined) row.include_narrative = patch.includeNarrative;
      if (patch.selections !== undefined) row.selections = patch.selections;
      const { error } = await supabase
        .from("report_insights")
        .update(row)
        .eq("run_id", runId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reports", "insights", runId] });
    },
  });

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
    saveReview,
  };
}
