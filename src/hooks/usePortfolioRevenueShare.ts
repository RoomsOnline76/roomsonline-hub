import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type ShareBasis = "gross_total" | "net_accommodation" | "net_after_rl_fees";

export interface ShareConfig {
  id: string;
  portfolio_id: string;
  share_basis: ShareBasis;
  include_portfolio_origin: boolean;
  include_cross_property_origin: boolean;
  portfolio_origin_default_percent: number;
  notes: string | null;
  updated_at: string;
}

export interface SharePair {
  id: string;
  portfolio_id: string;
  from_property_id: string;
  to_property_id: string;
  share_percent: number;
  set_by_role: string | null;
  updated_at: string;
}

export interface ShareInvoice {
  id: string;
  portfolio_id: string;
  from_property_id: string;
  to_property_id: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  invoice_number: string | null;
  sent_at: string | null;
  paid_at: string | null;
}

export function usePortfolioShareConfig(portfolioId: string | null | undefined) {
  return useQuery({
    enabled: !!portfolioId,
    queryKey: ["portfolio-share-config", portfolioId],
    queryFn: async (): Promise<ShareConfig | null> => {
      const { data, error } = await supabase
        .from("portfolio_revenue_share_config" as never)
        .select("*")
        .eq("portfolio_id", portfolioId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ShareConfig | null) ?? null;
    },
  });
}

export function useUpsertShareConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (cfg: Partial<ShareConfig> & { portfolio_id: string }) => {
      const { error } = await supabase
        .from("portfolio_revenue_share_config" as never)
        .upsert(cfg as never, { onConflict: "portfolio_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["portfolio-share-config", v.portfolio_id] });
      toast({ title: "Share config saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
}

export function useSharePairs(portfolioId: string | null | undefined) {
  return useQuery({
    enabled: !!portfolioId,
    queryKey: ["portfolio-share-pairs", portfolioId],
    queryFn: async (): Promise<SharePair[]> => {
      const { data, error } = await supabase
        .from("portfolio_revenue_share_pairs" as never)
        .select("*")
        .eq("portfolio_id", portfolioId!);
      if (error) throw error;
      return (data as SharePair[]) ?? [];
    },
  });
}

export function useUpsertSharePair() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p: { portfolio_id: string; from_property_id: string; to_property_id: string; share_percent: number; set_by_role?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("portfolio_revenue_share_pairs" as never)
        .upsert({ ...p, set_by_user_id: user?.id ?? null } as never, { onConflict: "portfolio_id,from_property_id,to_property_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["portfolio-share-pairs", v.portfolio_id] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function usePortfolioShareInvoices(portfolioId: string | null | undefined) {
  return useQuery({
    enabled: !!portfolioId,
    queryKey: ["portfolio-share-invoices", portfolioId],
    queryFn: async (): Promise<ShareInvoice[]> => {
      const { data, error } = await supabase
        .from("portfolio_share_invoices" as never)
        .select("*")
        .eq("portfolio_id", portfolioId!)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data as ShareInvoice[]) ?? [];
    },
  });
}

export function useShareAttributions(filter: { propertyId?: string; portfolioId?: string; from?: string; to?: string }) {
  return useQuery({
    enabled: !!(filter.propertyId || filter.portfolioId),
    queryKey: ["share-attributions", filter],
    queryFn: async () => {
      let q = supabase.from("booking_revenue_attributions" as never).select("*").order("created_at", { ascending: false });
      if (filter.portfolioId) q = q.eq("portfolio_id", filter.portfolioId);
      if (filter.propertyId) q = q.or(`from_property_id.eq.${filter.propertyId},to_property_id.eq.${filter.propertyId}`);
      if (filter.from) q = q.gte("created_at", filter.from);
      if (filter.to) q = q.lte("created_at", filter.to);
      const { data, error } = await q;
      if (error) throw error;
      return data as Array<{
        id: string;
        booking_id: string;
        portfolio_id: string;
        from_property_id: string;
        to_property_id: string;
        origin_type: string;
        basis_amount: number;
        share_percent: number;
        share_amount: number;
        currency: string;
        status: string;
        created_at: string;
      }>;
    },
  });
}
