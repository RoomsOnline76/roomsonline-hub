import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingConfig {
  id: string;
  property_id: string;
  owner_id: string | null;
  billing_strategy: string;
  commission_rate: number | null;
  /** Commission on ROL marketplace bookings (falls back to commission_rate). */
  listing_commission_rate?: number | null;
  /** Commission on the property's own surfaces (white-label, direct, widget, embed, API). */
  pms_commission_rate?: number | null;

  widget_flat_commission_rate?: number | null;
  subscription_fee_monthly: number | null;
  transaction_fee_percentage: number | null;
  payment_facilitator_enabled: boolean;
  byo_gateway_monthly_fee?: number | null;
  white_label_allowed: boolean;
  white_label_monthly_fee?: number | null;
  white_label_setup_fee?: number | null;
  white_label_billing_mode?: "monthly" | "annual" | null;
  branding_addon_enabled?: boolean | null;
  branding_addon_monthly_fee?: number | null;
  branding_addon_setup_fee?: number | null;
  branding_addon_billing_mode?: "monthly" | "annual" | null;
  pricelabs_allowed?: boolean;
  pricelabs_monthly_fee?: number | null;
  pricelabs_setup_fee?: number | null;
  channel_manager_enabled?: boolean | null;
  channel_manager_per_unit_fee?: number | null;
  volume_tier_json: Record<string, number> | null;
  tier_pricing_json: Array<{ min_rooms: number; max_rooms: number | null; max_properties?: number | null; monthly_fee: number | null; label?: string }> | null;
  tier_scope: "property" | "portfolio" | null;
  room_count_override: number | null;
  enterprise_custom_fee?: number | null;
  billing_start_date: string | null;
  linked_contract_id: string | null;
  custom_overrides: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BillingScope {
  source: "property" | "portfolio";
  portfolioId: string | null;
  portfolioName: string | null;
  siblingPropertyIds: string[];
}

/**
 * Portfolio-aware billing config hook.
 * If the property is a member of a portfolio, billing is read from and written to
 * `portfolio_billing_configs` (one config shared across every member property).
 * Otherwise the legacy per-property `property_billing_configs` row is used.
 */
export function useBillingConfig(propertyId: string | undefined) {
  const queryClient = useQueryClient();

  // Resolve portfolio membership up front so the config query keys can include it.
  const membershipQ = useQuery({
    queryKey: ["billing-config-membership", propertyId],
    queryFn: async (): Promise<BillingScope> => {
      if (!propertyId) {
        return { source: "property", portfolioId: null, portfolioName: null, siblingPropertyIds: [] };
      }
      const { data: mem } = await supabase
        .from("property_portfolio_members")
        .select("portfolio_id")
        .eq("property_id", propertyId)
        .maybeSingle();
      const portfolioId = (mem?.portfolio_id as string | undefined) || null;
      if (!portfolioId) {
        return { source: "property", portfolioId: null, portfolioName: null, siblingPropertyIds: [] };
      }
      const [{ data: pf }, { data: siblings }] = await Promise.all([
        supabase.from("property_portfolios").select("name").eq("id", portfolioId).maybeSingle(),
        supabase.from("property_portfolio_members").select("property_id").eq("portfolio_id", portfolioId),
      ]);
      return {
        source: "portfolio",
        portfolioId,
        portfolioName: (pf?.name as string | undefined) || null,
        siblingPropertyIds: (siblings || []).map((s: any) => s.property_id),
      };
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  const scope: BillingScope =
    membershipQ.data ?? { source: "property", portfolioId: null, portfolioName: null, siblingPropertyIds: [] };

  const query = useQuery({
    queryKey: ["billing-config", propertyId, scope.portfolioId],
    queryFn: async () => {
      if (!propertyId) return null;

      if (scope.source === "portfolio" && scope.portfolioId) {
        const { data, error } = await supabase
          .from("portfolio_billing_configs" as any)
          .select("*")
          .eq("portfolio_id", scope.portfolioId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        // Present the portfolio row through the BillingConfig interface;
        // property_id is filled with the current property just so downstream
        // consumers that key on property_id keep working.
        return { ...(data as any), property_id: propertyId } as unknown as BillingConfig;
      }

      const { data, error } = await supabase
        .from("property_billing_configs")
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BillingConfig | null;
    },
    enabled: !!propertyId && !membershipQ.isLoading,
  });

  const upsert = useMutation({
    mutationFn: async (config: Partial<BillingConfig> & { property_id: string }) => {
      const isPortfolio = scope.source === "portfolio" && !!scope.portfolioId;
      const entityCol = isPortfolio ? "portfolio_id" : "property_id";
      const entityId = isPortfolio ? scope.portfolioId! : config.property_id;
      const table = isPortfolio ? "portfolio_billing_configs" : "property_billing_configs";

      // Snapshot the contracted position before the change so the backend can
      // bill only the new balance and detect a subscription-model switch.
      const { data: before } = await supabase
        .from(table as any)
        .select("*")
        .eq(entityCol, entityId)
        .maybeSingle();

      let saved: any;
      if (isPortfolio) {
        const { property_id: _pid, id: _id, owner_id: _oid, ...rest } = config as any;
        const payload = { ...rest, portfolio_id: scope.portfolioId };
        const { data, error } = await supabase
          .from("portfolio_billing_configs" as any)
          .upsert(payload as any, { onConflict: "portfolio_id" })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from("property_billing_configs")
          .upsert(config as any, { onConflict: "property_id" })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }

      // A refused write can come back without an error but leave the row
      // untouched (RLS filters the update away). Read the row back and prove
      // every submitted value actually landed before we claim success or act
      // on the change downstream.
      const { data: after } = await supabase
        .from(table as any)
        .select("*")
        .eq(entityCol, entityId)
        .maybeSingle();
      const stored: any = after ?? saved ?? {};
      const mismatched = VERIFIED_FIELDS.filter((field) => {
        const intended = (config as any)[field];
        if (intended === undefined) return false;
        return !sameBillingValue(stored[field], intended);
      });
      if (!after || mismatched.length) {
        throw new Error(
          `Billing configuration was not saved — the database did not accept ${
            mismatched.length ? mismatched.join(", ") : "the change"
          }. Your account may not have permission to change billing for this property.`,
        );
      }

      // React to the change: incremental once-off invoice and/or scheduled
      // subscription-model switch, with owner + admin notifications.
      let change: any = null;
      try {
        const { data: res } = await supabase.functions.invoke("subscription-billing-actions", {
          body: {
            action: "apply_config_change",
            scope: isPortfolio ? "portfolio" : "property",
            entity_id: entityId,
            before: before ?? {},
          },
        });
        if (res?.success) change = res;
      } catch (e) {
        console.error("[useBillingConfig] apply_config_change failed", e);
      }
      return { ...stored, __change: change, __verified: true };
    },

    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["billing-config", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["billing-config-membership", propertyId] });
      // Sync white_label_allowed → brand_override_enabled on all affected properties.
      if (data?.white_label_allowed != null) {
        const targetIds =
          scope.source === "portfolio" && scope.siblingPropertyIds.length
            ? scope.siblingPropertyIds
            : propertyId
            ? [propertyId]
            : [];
        if (targetIds.length) {
          await supabase
            .from("properties")
            .update({ brand_override_enabled: data.white_label_allowed } as any)
            .in("id", targetIds);
        }
      }
      const change = data?.__change;
      const notes: string[] = [];
      if (Number(change?.setup_delta) > 0) {
        notes.push(`Outstanding once-off balance of R${Number(change.setup_delta).toLocaleString()} invoiced`);
      }
      if (change?.plan_change) {
        notes.push(
          `Plan change scheduled — current plan runs to ${change.plan_change.runs_to}, new monthly fee of R${Number(
            change.plan_change.new_monthly_fee
          ).toLocaleString()} activates from ${change.plan_change.effective_date}`
        );
      }
      if (change?.requires_credit_note) {
        notes.push("A once-off fee was reduced after payment — a credit note must be raised manually");
      }
      toast.success(
        scope.source === "portfolio"
          ? `Portfolio billing saved — applies to ${scope.siblingPropertyIds.length} propert${scope.siblingPropertyIds.length === 1 ? "y" : "ies"}`
          : "Billing configuration saved",
        notes.length ? { description: notes.join(". "), duration: 10000 } : undefined
      );

    },
    onError: (error: any) => {
      toast.error("Failed to save billing config", { description: error.message });
    },
  });

  return {
    config: query.data,
    isLoading: query.isLoading || membershipQ.isLoading,
    error: query.error,
    upsert,
    scope,
  };
}
