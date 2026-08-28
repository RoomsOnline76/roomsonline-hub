import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  REPORT_DATA_PAGES,
  REPORT_NOTES_PAGE,
  expandLegacyMediaKeys,
  orderPageKeys,
  type ReportPageDefinition,
} from "@/lib/reportPages";
import { useReportLayoutTemplate } from "@/hooks/useReportLayoutTemplate";
import { portableLayout } from "@/lib/reportLayoutTemplate";

export interface PageOrderState {
  order: string[];
  hidden: string[];
}

export interface OrganizerPage extends ReportPageDefinition {
  hidden: boolean;
}

const parse = (raw: unknown): PageOrderState => {
  if (Array.isArray(raw)) return { order: raw.map(String).filter(Boolean), hidden: [] };
  if (raw && typeof raw === "object") {
    const value = raw as { order?: unknown; hidden?: unknown };
    return {
      order: Array.isArray(value.order) ? value.order.map(String).filter(Boolean) : [],
      hidden: Array.isArray(value.hidden) ? value.hidden.map(String).filter(Boolean) : [],
    };
  }
  return { order: [], hidden: [] };
};

/**
 * Slide organizer state for a run: the printed page sequence plus the pages the
 * reviewer chose to hide. Saved on `report_runs.page_order`.
 */
export function useReportPageOrder(
  runId: string | undefined,
  /** Media pages that will print — section pages plus per-image slides. */
  mediaPages: ReportPageDefinition[],
  /** Legacy section key -> per-image slide keys, so old saved orders survive. */
  legacyExpansions: Record<string, string[]> = {},
  /** Property the run belongs to — carries the layout over between runs. */
  propertyId?: string,
) {
  const queryClient = useQueryClient();
  const { template, saveTemplate } = useReportLayoutTemplate(propertyId);
  const queryKey = useMemo(() => ["report-page-order", runId], [runId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(runId),
    staleTime: 30_000,
    queryFn: async (): Promise<PageOrderState> => {
      const { data, error } = await supabase
        .from("report_runs")
        .select("page_order")
        .eq("id", runId as string)
        .maybeSingle();
      if (error) throw error;
      return parse(data?.page_order);
    },
  });

  const saved = query.data ?? { order: [], hidden: [] };
  // A run with no order of its own inherits the property's saved layout.
  const state: PageOrderState =
    saved.order.length === 0 && saved.hidden.length === 0 && template.order.length > 0
      ? { order: template.order, hidden: template.hidden }
      : saved;

  const available: ReportPageDefinition[] = useMemo(
    () => [...REPORT_DATA_PAGES, ...mediaPages, REPORT_NOTES_PAGE],
    [mediaPages],
  );

  const pages: OrganizerPage[] = useMemo(() => {
    const byKey = new Map(available.map((page) => [page.key, page]));
    return orderPageKeys(
      available.map((page) => page.key),
      expandLegacyMediaKeys(state.order, legacyExpansions),
    )
      .map((key) => byKey.get(key))
      .filter((page): page is ReportPageDefinition => Boolean(page))
      .map((page) => ({ ...page, hidden: state.hidden.includes(page.key) }));
  }, [available, legacyExpansions, state.hidden, state.order]);

  const save = useMutation({
    mutationFn: async (next: PageOrderState) => {
      if (!runId) throw new Error("No run selected");
      const { error } = await supabase
        .from("report_runs")
        .update({ page_order: { order: next.order, hidden: next.hidden } })
        .eq("id", runId);
      if (error) throw error;
      const portable = portableLayout(next.order, next.hidden);
      await saveTemplate({ order: portable.order, hidden: portable.hidden });
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the slide order"),
  });

  const persist = useCallback(
    (next: PageOrderState) => {
      queryClient.setQueryData(queryKey, next);
      save.mutate(next);
    },
    [queryClient, queryKey, save],
  );

  const movePage = useCallback(
    (key: string, direction: -1 | 1) => {
      const keys = pages.map((page) => page.key);
      const index = keys.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= keys.length) return;
      const next = [...keys];
      next.splice(target, 0, next.splice(index, 1)[0]);
      persist({ order: next, hidden: state.hidden });
    },
    [pages, persist, state.hidden],
  );

  const reorderTo = useCallback(
    (key: string, targetIndex: number) => {
      const keys = pages.map((page) => page.key);
      const index = keys.indexOf(key);
      if (index < 0 || targetIndex < 0 || targetIndex >= keys.length || index === targetIndex) return;
      const next = [...keys];
      next.splice(targetIndex, 0, next.splice(index, 1)[0]);
      persist({ order: next, hidden: state.hidden });
    },
    [pages, persist, state.hidden],
  );

  const toggleHidden = useCallback(
    (key: string) => {
      const hidden = state.hidden.includes(key)
        ? state.hidden.filter((entry) => entry !== key)
        : [...state.hidden, key];
      persist({ order: pages.map((page) => page.key), hidden });
    },
    [pages, persist, state.hidden],
  );

  const reset = useCallback(() => {
    persist({ order: [], hidden: [] });
    toast.success("Default slide order restored");
  }, [persist]);

  return {
    pages,
    isLoading: query.isLoading,
    isSaving: save.isPending,
    movePage,
    reorderTo,
    toggleHidden,
    reset,
  };
}
