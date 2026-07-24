import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingDefault {
  id: string;
  strategy: string;
  preset_name: string | null;
  preset_description: string | null;
  is_preset: boolean | null;
  sort_order: number | null;
  default_commission_rate: number | null;
  widget_flat_commission_rate?: number | null;
  default_subscription_fee: number | null;
  default_transaction_fee: number | null;
  white_label_monthly_fee: number | null;
  white_label_setup_fee?: number | null;
  white_label_billing_mode?: "monthly" | "annual" | null;
  branding_addon_allowed?: boolean | null;
  branding_addon_monthly_fee?: number | null;
  branding_addon_setup_fee?: number | null;
  branding_addon_billing_mode?: "monthly" | "annual" | null;
  pricelabs_monthly_fee?: number | null;
  pricelabs_setup_fee?: number | null;
  channel_manager_per_unit_fee?: number | null;
  portfolio_aggregator_billing_mode?: "none" | "monthly" | "once_off" | null;
  portfolio_aggregator_monthly_default?: number | null;
  portfolio_aggregator_setup_default?: number | null;
  sales_rep_tier_criteria_json?: any;
  byo_gateway_monthly_fee?: number | null;
  referral_first_year_rate: number | null;
  referral_residual_rate: number | null;
  referral_residual_months: number | null;
  referral_clawback_days: number | null;
  notes: string | null;
  tier_pricing_json: Array<{ min_rooms: number; max_rooms: number | null; max_properties?: number | null; monthly_fee: number | null; label?: string }> | null;
  enterprise_custom_fee?: number | null;
  updated_at: string;
  updated_by: string | null;
}

export function presetLabel(row: Pick<BillingDefault, "preset_name" | "strategy">): string {
  return row.preset_name?.trim() || row.strategy;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `preset_${Date.now()}`;
}

export function useBillingDefaults() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["billing-global-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_global_defaults")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("strategy", { ascending: true });

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
      toast.success("Preset saved");
    },
    onError: (error) => {
      toast.error("Failed to save preset", { description: (error as Error).message });
    },
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<BillingDefault> & { preset_name: string }) => {
      const rawSlug = (payload.strategy && payload.strategy.trim()) || slugify(payload.preset_name);
      // ensure uniqueness
      const existing = query.data ?? [];
      let slug = rawSlug;
      let n = 1;
      while (existing.some((d) => d.strategy === slug)) {
        n += 1;
        slug = `${rawSlug}_${n}`;
      }
      const insertRow: any = {
        ...payload,
        strategy: slug,
        preset_name: payload.preset_name,
        is_preset: true,
        sort_order: payload.sort_order ?? (existing.length + 1) * 10,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("billing_global_defaults")
        .insert(insertRow)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as BillingDefault;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-global-defaults"] });
      toast.success("Preset created");
    },
    onError: (error) => {
      toast.error("Failed to create preset", { description: (error as Error).message });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("billing_global_defaults").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-global-defaults"] });
      toast.success("Preset deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete preset", { description: (error as Error).message });
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
    create,
    remove,
    getDefaultsForStrategy,
  };
}
