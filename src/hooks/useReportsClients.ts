import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_REPORT_SOURCE, type ReportSourceKey } from "@/lib/report-adapters";

export interface ReportsClientInput {
  name: string;
  city: string;
  country: string;
  roomCount: number;
  defaultSourceType: ReportSourceKey;
  specialReportSet?: string | null;
}

/**
 * Reporting-only clients are stored as parked property records:
 * `is_reports_client = true` and `is_active = false`, which keeps them out of
 * every ROL selector (all of which require `is_active = true`) while still
 * satisfying the report_runs / property_report_settings foreign keys.
 */
const REPORTS_CLIENT_PROPERTY_DEFAULTS = {
  is_reports_client: true,
  is_active: false,
  show_on_website: false,
  ru_push_enabled: false,
  property_type: "reporting_client",
  price_per_night: 0,
} as const;

export function useReportsClients() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const createClient = useMutation({
    mutationFn: async (input: ReportsClientInput): Promise<string> => {
      const name = input.name.trim();
      if (!name) throw new Error("Client name is required");
      const rooms = Math.max(1, Math.floor(input.roomCount || 1));

      const { data, error } = await supabase
        .from("properties")
        .insert({
          ...REPORTS_CLIENT_PROPERTY_DEFAULTS,
          name,
          address: input.city.trim() || name,
          city: input.city.trim() || "—",
          country: input.country.trim() || "South Africa",
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: settingsError } = await supabase
        .from("property_report_settings")
        .upsert(
          {
            property_id: data.id,
            room_count: rooms,
            brand_source: "custom",
            default_source_type: input.defaultSourceType ?? DEFAULT_REPORT_SOURCE,
            special_report_set: input.specialReportSet ?? null,
            historical_baseline: {} as never,
          },
          { onConflict: "property_id" },
        );
      if (settingsError) throw settingsError;

      return data.id;
    },
    onSuccess: invalidate,
  });

  const updateClient = useMutation({
    mutationFn: async (
      input: { id: string } & Partial<Pick<ReportsClientInput, "name" | "city" | "country">>,
    ) => {
      const patch: Record<string, string> = {};
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new Error("Client name is required");
        patch.name = name;
      }
      if (input.city !== undefined) patch.city = input.city.trim() || "—";
      if (input.country !== undefined) patch.country = input.country.trim() || "South Africa";
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from("properties")
        .update(patch as never)
        .eq("id", input.id)
        .eq("is_reports_client", true);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const archiveClient = useMutation({
    mutationFn: async (input: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("properties")
        .update({ reports_client_archived_at: input.archived ? new Date().toISOString() : null })
        .eq("id", input.id)
        .eq("is_reports_client", true);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createClient, updateClient, archiveClient };
}
