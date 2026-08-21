import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface DraftResult {
  ok: boolean;
  message?: string;
  url?: string;
  path?: string;
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

/** Builds the branded draft report and the optional Canva asset pack. */
export function useReportDraft(runId: string | undefined) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPacking, setIsPacking] = useState(false);

  const invoke = useCallback(
    async (action: "report" | "pack"): Promise<DraftResult> => {
      if (!runId) return { ok: false, message: "No run selected" };
      const { data, error } = await supabase.functions.invoke("revenue-report-draft", {
        body: { run_id: runId, action },
      });
      if (error) return { ok: false, message: await readError(error) };
      if (data?.error) return { ok: false, message: String(data.error) };
      if (!data?.url) return { ok: false, message: "No link returned" };
      return { ok: true, url: String(data.url), path: data.path ? String(data.path) : undefined };
    },
    [runId],
  );

  const generate = useCallback(async (): Promise<DraftResult> => {
    setIsGenerating(true);
    try {
      return await invoke("report");
    } finally {
      setIsGenerating(false);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  }, [invoke, queryClient]);

  const buildPack = useCallback(async (): Promise<DraftResult> => {
    setIsPacking(true);
    try {
      return await invoke("pack");
    } finally {
      setIsPacking(false);
    }
  }, [invoke]);

  return { generate, buildPack, isGenerating, isPacking };
}
