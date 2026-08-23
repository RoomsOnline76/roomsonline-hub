import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toRenderableReport, type RenderableReport } from "@/lib/reportDraftHtml";

/** Bespoke owner slides generated outside the standard pack. */
export interface SpecialReport {
  id: string;
  runId: string;
  reportKey: string;
  title: string;
  storagePath: string;
  rowCount: number;
  currentLabel: string | null;
  priorLabel: string | null;
  warnings: string[];
  generatedAt: string | null;
  /** Printed position in the owner pack; large for legacy rows. */
  packIndex: number;

}

const BUCKET = "revenue-reports";

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

export function useSpecialReports(runId: string | undefined) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  const query = useQuery({
    queryKey: ["reports", "special", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<SpecialReport[]> => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from("report_special_reports")
        .select("id, run_id, report_key, title, storage_path, payload, warnings, generated_at")
        .eq("run_id", runId)
        .order("report_key", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            runId: row.run_id,
            reportKey: row.report_key,
            title: row.title ?? row.report_key,
            storagePath: row.storage_path,
            rowCount: Number(payload.row_count) || 0,
            currentLabel: typeof payload.current_label === "string" ? payload.current_label : null,
            priorLabel: typeof payload.prior_label === "string" ? payload.prior_label : null,
            warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
            generatedAt: row.generated_at ?? null,
            // Owner packs carry their printed position; older rows fall back to name order.
            packIndex:
              typeof payload.pack_index === "number" ? payload.pack_index : Number.MAX_SAFE_INTEGER,
          };
        })
        .sort((a, b) => a.packIndex - b.packIndex || a.reportKey.localeCompare(b.reportKey));

    },
  });

  const generate = useCallback(async (): Promise<{ ok: boolean; message?: string; count?: number }> => {
    if (!runId) return { ok: false, message: "No run selected" };
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("cheetaplains-special-reports", {
        body: { run_id: runId },
      });
      if (error) return { ok: false, message: await readError(error) };
      await queryClient.invalidateQueries({ queryKey: ["reports", "special", runId] });
      return { ok: true, count: Array.isArray(data?.reports) ? data.reports.length : 0 };
    } finally {
      setIsGenerating(false);
    }
  }, [runId, queryClient]);

  /**
   * Short-lived renderable copy of a generated slide plus its document title
   * (used as the saved PDF filename).
   */
  const open = useCallback(async (storagePath: string): Promise<RenderableReport | null> => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 30);
    if (error || !data?.signedUrl) return null;
    return await toRenderableReport(data.signedUrl);
  }, []);


  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    generate,
    isGenerating,
    open,
    refetch: query.refetch,
  };
}
