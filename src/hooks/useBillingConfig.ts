import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingConfig {
  id: string;
  property_id: string;
  owner_id: string | null;
  billing_strategy: string;
  commission_rate: number | null;
  subscription_fee_monthly: number | null;
  transaction_fee_percentage: number | null;
  payment_facilitator_enabled: boolean;
  white_label_allowed: boolean;
  white_label_monthly_fee?: number | null;
  pricelabs_allowed?: boolean;
  pricelabs_monthly_fee?: number | null;
  volume_tier_json: Record<string, number> | null;
  tier_pricing_json: Array<{ min_rooms: number; max_rooms: number | null; monthly_fee: number }> | null;
  tier_scope: "property" | "portfolio" | null;
  room_count_override: number | null;
  billing_start_date: string | null;
  linked_contract_id: string | null;
  custom_overrides: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useBillingConfig(propertyId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["billing-config", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("property_billing_configs")
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as BillingConfig | null;
    },
    enabled: !!propertyId,
  });

  const upsert = useMutation({
    mutationFn: async (config: Partial<BillingConfig> & { property_id: string }) => {
      const { data, error } = await supabase
        .from("property_billing_configs")
        .upsert(config as any, { onConflict: "property_id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["billing-config", propertyId] });
      // Sync white_label_allowed → brand_override_enabled on property
      if (propertyId && data?.white_label_allowed != null) {
        supabase
          .from("properties")
          .update({ brand_override_enabled: data.white_label_allowed } as any)
          .eq("id", propertyId)
          .then();
      }
      toast.success("Billing configuration saved");
    },
    onError: (error) => {
      toast.error("Failed to save billing config", { description: error.message });
    },
  });

  return { config: query.data, isLoading: query.isLoading, error: query.error, upsert };
}
