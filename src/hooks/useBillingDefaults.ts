import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingDefault {
  id: string;
  strategy: string;
  default_commission_rate: number | null;
  default_subscription_fee: number | null;
  default_transaction_fee: number | null;
  white_label_monthly_fee: number | null;
  payment_facilitator_fee: number | null;
  referral_first_year_rate: number | null;
  referral_residual_rate: number | null;
  referral_residual_months: number | null;
  referral_clawback_days: number | null;
  notes: string | null;
  tier_pricing_json: Array<{ min_rooms: number; max_rooms: number | null; monthly_fee: number }> | null;
  updated_at: string;
  updated_by: string | null;
}

export function useBillingDefaults() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["billing-global-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_global_defaults")
        .select("*")
        .order("strategy");

      if (error) throw error;
      return data as unknown as BillingDefault[];
    },
  });

  const update = useMutation({
    mutationFn: async (defaults: Partial<BillingDefault> & { id: string }) => {
      const { id, ...updates } = defaults;
      const { data, error } = await supabase
        .from("billing_global_defaults")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-global-defaults"] });
      toast.success("Global defaults updated");
    },
    onError: (error) => {
      toast.error("Failed to update defaults", { description: error.message });
    },
  });

  const getDefaultsForStrategy = (strategy: string): BillingDefault | undefined => {
    return query.data?.find((d) => d.strategy === strategy);
  };

  return {
    defaults: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    update,
    getDefaultsForStrategy,
  };
}
