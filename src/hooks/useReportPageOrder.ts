import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  REPORT_DATA_PAGES,
  REPORT_NOTES_PAGE,
  mediaPageKey,
  orderPageKeys,
  type ReportPageDefinition,
} from "@/lib/reportPages";

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
  mediaSections: { section: string; images: number; titles: string[] }[],
) {
  const queryClient = useQueryClient();
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

  const state = query.data ?? { order: [], hidden: [] };

  const available: ReportPageDefinition[] = useMemo(
    () => [
      ...REPORT_DATA_PAGES,
      ...mediaSections.map((entry) => {
        const countLabel =
          entry.images === 0
            ? "No images yet"
            : `${entry.images} image${entry.images === 1 ? "" : "s"}`;
        const titleList = entry.titles.filter(Boolean).join(", ");
        return {
          key: mediaPageKey(entry.section),
          title: entry.section,
          summary: titleList ? `${countLabel} · ${titleList}` : countLabel,
        };
      }),
      REPORT_NOTES_PAGE,
    ],
    [mediaSections],
  );

  const pages: OrganizerPage[] = useMemo(() => {
    const byKey = new Map(available.map((page) => [page.key, page]));
    return orderPageKeys(
      available.map((page) => page.key),
      state.order,
    )
      .map((key) => byKey.get(key))
      .filter((page): page is ReportPageDefinition => Boolean(page))
      .map((page) => ({ ...page, hidden: state.hidden.includes(page.key) }));
  }, [available, state.hidden, state.order]);

  const save = useMutation({
    mutationFn: async (next: PageOrderState) => {
      if (!runId) throw new Error("No run selected");
      const { error } = await supabase
        .from("report_runs")
        .update({ page_order: { order: next.order, hidden: next.hidden } })
        .eq("id", runId);
      if (error) throw error;
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
