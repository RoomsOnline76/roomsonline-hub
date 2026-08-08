import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionAccess {
  /** Still loading — never restrict the UI while unknown. */
  loading: boolean;
  /** True once the paid period lapsed after a cancellation: functionality ceases. */
  suspended: boolean;
  /** A cancellation is scheduled but service still runs to `paidThrough`. */
  cancelling: boolean;
  /** Last day covered by a paid subscription period. */
  paidThrough: string | null;
  status: string | null;
  refresh: () => Promise<void>;
}

const EMPTY: Omit<SubscriptionAccess, "refresh"> = {
  loading: true,
  suspended: false,
  cancelling: false,
  paidThrough: null,
  status: null,
};

/**
 * Resolves whether a property's ROL'OS subscription still entitles it to full
 * functionality. A cancellation is always honoured to the end of the paid
 * period; only once the account is actually suspended do we restrict access.
 *
 * Portfolio-level billing wins when a property inherits it.
 */
export function useSubscriptionAccess(propertyId?: string | null): SubscriptionAccess {
  const [state, setState] = useState(EMPTY);

  const refresh = useCallback(async () => {
    if (!propertyId) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    try {
      const { data: propCfg } = await supabase
        .from("property_billing_configs")
        .select("subscription_status, cancel_at_period_end, cancel_effective_date, current_period_end, suspended_at")
        .eq("property_id", propertyId)
        .maybeSingle();

      let cfg = propCfg as Record<string, unknown> | null;

      if (!cfg) {
        const { data: member } = await supabase
          .from("property_portfolio_members")
          .select("portfolio_id")
          .eq("property_id", propertyId)
          .maybeSingle();
        if (member?.portfolio_id) {
          const { data: pfCfg } = await supabase
            .from("portfolio_billing_configs")
            .select(
              "subscription_status, cancel_at_period_end, cancel_effective_date, current_period_end, suspended_at",
            )
            .eq("portfolio_id", member.portfolio_id)
            .maybeSingle();
          cfg = pfCfg as Record<string, unknown> | null;
        }
      }

      if (!cfg) {
        setState({ ...EMPTY, loading: false });
        return;
      }

      const status = (cfg.subscription_status as string | null) ?? null;
      const suspended = !!cfg.suspended_at || status === "suspended";
      setState({
        loading: false,
        suspended,
        cancelling: !!cfg.cancel_at_period_end && !suspended,
        paidThrough:
          ((cfg.cancel_effective_date as string | null) ?? (cfg.current_period_end as string | null))?.slice(0, 10) ??
          null,
        status,
      });
    } catch (err) {
      console.error("[useSubscriptionAccess] failed", err);
      setState({ ...EMPTY, loading: false });
    }
  }, [propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
