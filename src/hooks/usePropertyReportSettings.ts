import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HistoricalBaseline } from "@/lib/historicalBaseline";
import type { ReportBrandSource } from "@/lib/reportBranding";
import { parseNbProfile, type NbProfile } from "@/lib/nbProfile";
import { parseReportProfile, type ReportProfile } from "@/lib/reportProfile";

export interface PropertyReportSettings {
  propertyId: string;
  roomCount: number;
  reportLogoUrl: string | null;
  coverArtworkUrl: string | null;
  brandPrimary: string | null;
  brandSecondary: string | null;
  brandSource: ReportBrandSource;
  logoInvert: boolean;
  historicalBaseline: HistoricalBaseline;
  defaultSourceType: string;
  /** Bespoke report set flag, e.g. `cheetaplains`. */
  specialReportSet: string | null;
  /** Labels whose 0.00 rows are real nights (e.g. `TOURVEST`). */
  zeroRevenueKeepPatterns: string[];
  /** Labels that are never sold nights, whatever the revenue. */
  rowExcludePatterns: string[];
  /** NightsBridge quirks: exclusion, routing, grouping, STLY baseline. */
  nbProfile: NbProfile;
  /** Comparison-column quirks: extra years, STLY source, missing PMS export. */
  reportProfile: ReportProfile;
}

const KEY = ["reports", "property-settings"] as const;

/** Trimmed, de-duplicated pattern list. */
const asPatternList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = String(entry ?? "").trim();
    if (text) seen.add(text);
  }
  return [...seen];
};

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
        brandSource: ((data as { brand_source?: string }).brand_source ??
          "custom") as ReportBrandSource,
        logoInvert: Boolean((data as { logo_invert?: boolean }).logo_invert),
        historicalBaseline: (data.historical_baseline ?? {}) as HistoricalBaseline,
        defaultSourceType: data.default_source_type ?? "nightsbridge",
        specialReportSet:
          (data as { special_report_set?: string | null }).special_report_set ?? null,
        zeroRevenueKeepPatterns: asPatternList(
          (data as { zero_revenue_keep_patterns?: unknown }).zero_revenue_keep_patterns,
        ),
        rowExcludePatterns: asPatternList(
          (data as { row_exclude_patterns?: unknown }).row_exclude_patterns,
        ),
        nbProfile: parseNbProfile((data as { nb_profile?: unknown }).nb_profile ?? null),
        reportProfile: parseReportProfile(
          (data as { report_profile?: unknown }).report_profile ?? null,
        ),
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
          brand_source: input.brandSource ?? "custom",
          logo_invert: input.logoInvert ?? false,
          historical_baseline: (input.historicalBaseline ?? {}) as never,
          default_source_type: input.defaultSourceType ?? "nightsbridge",
          special_report_set: input.specialReportSet ?? null,
          // Only written when the caller supplies them, so a save from another
          // card cannot wipe the property's row rules.
          ...(input.zeroRevenueKeepPatterns
            ? { zero_revenue_keep_patterns: asPatternList(input.zeroRevenueKeepPatterns) as never }
            : {}),
          ...(input.rowExcludePatterns
            ? { row_exclude_patterns: asPatternList(input.rowExcludePatterns) as never }
            : {}),
          ...(input.nbProfile ? { nb_profile: input.nbProfile as never } : {}),
          ...(input.reportProfile ? { report_profile: input.reportProfile as never } : {}),
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

export type MonthlyInputField = "dinnerByMonth" | "room0ByMonth" | "compRnsByMonth";

/** Which months the reviewer typed over, so a re-parse leaves them alone. */
export interface MonthlyOverrideFlags {
  dinner_by_month: Record<string, boolean>;
  room0_by_month: Record<string, boolean>;
  comp_rns_by_month: Record<string, boolean>;
}

export interface ReportAdditionalInputs {
  dinnerByMonth: Record<string, number>;
  room0ByMonth: Record<string, number>;
  compRnsByMonth: Record<string, number>;
  overrides: MonthlyOverrideFlags;
  minStayNotes: string | null;
  promotionsNotes: string | null;
  rateOverrideNotes: string | null;
  freeCommentary: string | null;
}

const EMPTY_OVERRIDES: MonthlyOverrideFlags = {
  dinner_by_month: {},
  room0_by_month: {},
  comp_rns_by_month: {},
};

const EMPTY_INPUTS: ReportAdditionalInputs = {
  dinnerByMonth: {},
  room0ByMonth: {},
  compRnsByMonth: {},
  overrides: EMPTY_OVERRIDES,
  minStayNotes: null,
  promotionsNotes: null,
  rateOverrideNotes: null,
  freeCommentary: null,
};


export function useReportAdditionalInputs(runId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["reports", "additional-inputs", runId],
    enabled: Boolean(runId),
    queryFn: async (): Promise<ReportAdditionalInputs> => {
      if (!runId) return EMPTY_INPUTS;
      const { data, error } = await supabase
        .from("report_additional_inputs")
        .select(
          "dinner_by_month, room0_by_month, comp_rns_by_month, overrides, min_stay_notes, promotions_notes, rate_override_notes, free_commentary",
        )
        .eq("run_id", runId)
        .maybeSingle();
      if (error) throw error;
      const rawOverrides = (data?.overrides ?? {}) as Partial<MonthlyOverrideFlags>;
      return {
        dinnerByMonth: (data?.dinner_by_month ?? {}) as Record<string, number>,
        room0ByMonth: (data?.room0_by_month ?? {}) as Record<string, number>,
        compRnsByMonth: (data?.comp_rns_by_month ?? {}) as Record<string, number>,
        overrides: {
          dinner_by_month: rawOverrides.dinner_by_month ?? {},
          room0_by_month: rawOverrides.room0_by_month ?? {},
          comp_rns_by_month: rawOverrides.comp_rns_by_month ?? {},
        },
        minStayNotes: data?.min_stay_notes ?? null,
        promotionsNotes: data?.promotions_notes ?? null,
        rateOverrideNotes: data?.rate_override_notes ?? null,
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
          overrides: input.overrides as never,
          min_stay_notes: input.minStayNotes,
          promotions_notes: input.promotionsNotes,
          rate_override_notes: input.rateOverrideNotes,
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
