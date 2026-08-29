import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_PAGE2,
  parsePage2,
  serialisePage2,
  type Page2Document,
} from "@/lib/reports/page2";

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

interface Page2State {
  enabled: boolean;
  doc: Page2Document;
  /** Property-level default, carried into future runs. */
  propertyDefault: boolean;
}

/**
 * Page 2 — "TOBI Assessment" for one run: the opt-in switch, the stored
 * document and the generate/save actions. Turning it on for a property becomes
 * that property's default for later runs.
 */
export function useReportPage2(runId: string | undefined, propertyId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["reports", "page2", runId] as const;
  const [isGenerating, setIsGenerating] = useState(false);
  const carriedForward = useRef(false);

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(runId),
    queryFn: async (): Promise<Page2State> => {
      const [runRes, insightRes, settingsRes] = await Promise.all([
        supabase.from("report_runs").select("page2_enabled").eq("id", runId!).maybeSingle(),
        supabase.from("report_insights").select("page2").eq("run_id", runId!).maybeSingle(),
        propertyId
          ? supabase
              .from("property_report_settings")
              .select("report_profile")
              .eq("property_id", propertyId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as never),
      ]);
      if (runRes.error) throw runRes.error;
      if (insightRes.error) throw insightRes.error;
      const profile = ((settingsRes as { data?: { report_profile?: unknown } | null }).data
        ?.report_profile ?? {}) as Record<string, unknown>;
      return {
        enabled: (runRes.data as { page2_enabled?: boolean } | null)?.page2_enabled === true,
        doc: parsePage2((insightRes.data as { page2?: unknown } | null)?.page2 ?? null),
        propertyDefault: profile.page2_enabled === true,
      };
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!runId) return;
      const { error } = await supabase
        .from("report_runs")
        .update({ page2_enabled: enabled })
        .eq("id", runId);
      if (error) throw error;

      // Remember the choice for this property's future runs.
      if (propertyId) {
        const { data } = await supabase
          .from("property_report_settings")
          .select("report_profile")
          .eq("property_id", propertyId)
          .maybeSingle();
        const profile = ((data as { report_profile?: unknown } | null)?.report_profile ??
          {}) as Record<string, unknown>;
        await supabase
          .from("property_report_settings")
          .upsert(
            {
              property_id: propertyId,
              report_profile: { ...profile, page2_enabled: enabled } as never,
            },
            { onConflict: "property_id" },
          );
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const saveDoc = useMutation({
    mutationFn: async (doc: Page2Document) => {
      if (!runId) return;
      const { error } = await supabase
        .from("report_insights")
        .upsert(
          { run_id: runId, page2: serialisePage2({ ...doc, edited: true }) as never },
          { onConflict: "run_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const generate = useCallback(
    async (options: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> => {
      if (!runId) return { ok: false, error: "No run selected" };
      setIsGenerating(true);
      try {
        const { error } = await supabase.functions.invoke("reports-xai-insights", {
          body: { run_id: runId, action: "generate_page2", force: options.force === true },
        });
        if (error) return { ok: false, error: await readError(error) };
        await queryClient.invalidateQueries({ queryKey: key });
        return { ok: true };
      } finally {
        setIsGenerating(false);
      }
    },
    [runId, queryClient, key],
  );

  // A property that has opted in keeps Page 2 on for its later runs.
  useEffect(() => {
    const state = query.data;
    if (!state || carriedForward.current) return;
    if (state.propertyDefault && !state.enabled) {
      carriedForward.current = true;
      setEnabled.mutate(true);
    }
  }, [query.data, setEnabled]);

  return {
    enabled: query.data?.enabled ?? false,
    doc: query.data?.doc ?? EMPTY_PAGE2,
    propertyDefault: query.data?.propertyDefault ?? false,
    isLoading: query.isLoading,
    isGenerating,
    isSaving: saveDoc.isPending || setEnabled.isPending,
    setEnabled: (value: boolean) => setEnabled.mutateAsync(value),
    saveDoc: (doc: Page2Document) => saveDoc.mutateAsync(doc),
    generate,
  };
}
