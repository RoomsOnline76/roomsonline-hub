import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PropertyReportSettings {
  propertyId: string;
  roomCount: number;
  reportLogoUrl: string | null;
  coverArtworkUrl: string | null;
  brandPrimary: string | null;
  brandSecondary: string | null;
  historicalBaseline: {
    years?: number[];
    revenue?: Record<string, number>;
    room_nights?: Record<string, number>;
  };
  defaultSourceType: string;
}

const KEY = ["reports", "property-settings"] as const;

export function usePropertyReportSettings(propertyId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, propertyId],
    enabled: Boolean(propertyId),
    queryFn: async (): Promise<PropertyReportSettings | null> => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("property_report_settings")
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        propertyId: data.property_id,
        roomCount: data.room_count ?? 1,
        reportLogoUrl: data.report_logo_url,
        coverArtworkUrl: data.cover_artwork_url,
        brandPrimary: data.brand_primary,
        brandSecondary: data.brand_secondary,
        historicalBaseline: (data.historical_baseline ?? {}) as PropertyReportSettings["historicalBaseline"],
        defaultSourceType: data.default_source_type ?? "nightsbridge",
      };
    },
  });

  const save = useMutation({
    mutationFn: async (input: Partial<PropertyReportSettings> & { propertyId: string }) => {
      const { error } = await supabase.from("property_report_settings").upsert(
        {
          property_id: input.propertyId,
          room_count: input.roomCount ?? 1,
          report_logo_url: input.reportLogoUrl ?? null,
          cover_artwork_url: input.coverArtworkUrl ?? null,
          brand_primary: input.brandPrimary ?? null,
          brand_secondary: input.brandSecondary ?? null,
          historical_baseline: input.historicalBaseline ?? {},
          default_source_type: input.defaultSourceType ?? "nightsbridge",
        },
        { onConflict: "property_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isLoading,
    save,
    refetch: query.refetch,
  };
}

export interface ReportAdditionalInputs {
  dinnerByMonth: Record<string, number>;
  room0ByMonth: Record<string, number>;
  compRnsByMonth: Record<string, number>;
  freeCommentary: string | null;
}

export function useReportAdditionalInputs(runId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["reports", "additional-inputs", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<ReportAdditionalInputs> => {
      if (!runId) return { dinnerByMonth: {}, room0ByMonth: {}, compRnsByMonth: {}, freeCommentary: null };
      const { data, error } = await supabase
        .from("report_additional_inputs")
        .select("dinner_by_month, room0_by_month, comp_rns_by_month, free_commentary")
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      return {
        dinnerByMonth: (data?.dinner_by_month ?? {}) as Record<string, number>,
        room0ByMonth: (data?.room0_by_month ?? {}) as Record<string, number>,
        compRnsByMonth: (data?.comp_rns_by_month ?? {}) as Record<string, number>,
        freeCommentary: data?.free_commentary ?? null,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (input: ReportAdditionalInputs) => {
      if (!runId) return;
      const { error } = await supabase.from("report_additional_inputs").upsert(
        {
          run_id: runId,
          dinner_by_month: input.dinnerByMonth,
          room0_by_month: input.room0ByMonth,
          comp_rns_by_month: input.compRnsByMonth,
          free_commentary: input.freeCommentary,
        },
        { onConflict: "run_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  return { inputs: query.data ?? null, isLoading: query.isLoading, save };
}
