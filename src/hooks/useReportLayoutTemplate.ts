import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_LAYOUT_TEMPLATE,
  parseReportLayoutTemplate,
  type ReportLayoutTemplate,
} from "@/lib/reportLayoutTemplate";

/**
 * Reads and writes the property's saved report layout (slide order, hidden
 * pages and custom / renamed slide sections) so a new run starts where the last
 * one left off.
 */
export function useReportLayoutTemplate(propertyId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["report-layout-template", propertyId], [propertyId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(propertyId),
    staleTime: 60_000,
    queryFn: async (): Promise<ReportLayoutTemplate> => {
      const { data, error } = await supabase
        .from("property_report_settings")
        .select("report_layout_template")
        .eq("property_id", propertyId as string)
        .maybeSingle();
      if (error) throw error;
      return parseReportLayoutTemplate(data?.report_layout_template);
    },
  });

  const template = query.data ?? EMPTY_LAYOUT_TEMPLATE;

  const saveTemplate = useCallback(
    async (patch: Partial<ReportLayoutTemplate>) => {
      if (!propertyId) return;
      const next: ReportLayoutTemplate = { ...template, ...patch };
      queryClient.setQueryData(queryKey, next);
      const { error } = await supabase
        .from("property_report_settings")
        .update({ report_layout_template: next as never })
        .eq("property_id", propertyId);
      // A missing settings row simply means there is nothing to carry over yet.
      if (error && error.code !== "PGRST116") {
        console.warn("[reports] could not save layout template", error.message);
      }
    },
    [propertyId, queryClient, queryKey, template],
  );

  return { template, isLoading: query.isLoading, saveTemplate };
}
