import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Is the Channel Manager entitlement switched on (and therefore billable) for a
 * property?
 *
 * Billing is portfolio-first: a property that belongs to a portfolio is billed
 * from `portfolio_billing_configs`, so the per-property row alone is not
 * authoritative — reading only that row reports portfolio-enabled properties
 * (e.g. the Jongensfontein pair) as not entitled.
 *
 * A per-unit fee of 0 with the toggle on still counts as entitled: bundled or
 * promotional deals are included, the toggle alone decides.
 */
export async function fetchChannelManagerEntitlements(
  propertyIds: string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const ids = [...new Set(propertyIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const [{ data: members }, { data: propConfigs }] = await Promise.all([
    supabase.from("property_portfolio_members").select("property_id, portfolio_id").in("property_id", ids),
    supabase
      .from("property_billing_configs")
      .select("property_id, channel_manager_enabled")
      .in("property_id", ids),
  ]);

  const portfolioByProperty = new Map<string, string>();
  (members ?? []).forEach((m) => {
    if (m.portfolio_id) portfolioByProperty.set(m.property_id, m.portfolio_id);
  });

  const portfolioIds = [...new Set([...portfolioByProperty.values()])];
  const portfolioEnabled = new Map<string, boolean>();
  if (portfolioIds.length > 0) {
    const { data: pfConfigs } = await supabase
      .from("portfolio_billing_configs")
      .select("portfolio_id, channel_manager_enabled")
      .in("portfolio_id", portfolioIds);
    (pfConfigs ?? []).forEach((c) => {
      portfolioEnabled.set(c.portfolio_id, c.channel_manager_enabled === true);
    });
  }

  const propEnabled = new Map<string, boolean>();
  (propConfigs ?? []).forEach((c) => {
    propEnabled.set(c.property_id, c.channel_manager_enabled === true);
  });

  ids.forEach((id) => {
    const portfolioId = portfolioByProperty.get(id);
    // Portfolio billing wins when the property is a member; fall back to the
    // property row when the portfolio has no config row yet.
    const value = portfolioId && portfolioEnabled.has(portfolioId)
      ? portfolioEnabled.get(portfolioId) === true
      : propEnabled.get(id) === true;
    out.set(id, value);
  });

  return out;
}

/** Single-property entitlement, for the wizard mounts and property shortcuts. */
export function useChannelManagerEntitlement(propertyId: string | undefined) {
  const query = useQuery({
    queryKey: ["channel-manager-entitlement", propertyId],
    enabled: !!propertyId,
    staleTime: 15_000,
    // A billing toggle saved seconds ago must not be reported as "not enabled".
    refetchOnMount: "always",
    queryFn: async () => {
      const map = await fetchChannelManagerEntitlements([propertyId as string]);
      return map.get(propertyId as string) === true;
    },
  });

  return {
    enabled: query.data === true,
    resolved: !query.isLoading && !query.isPending,
    loading: query.isLoading || query.isPending,
    refetch: query.refetch,
  };
}

/** Batch entitlement lookup for list surfaces (onboarding queue, all properties). */
export function useChannelManagerEntitlements(propertyIds: string[]) {
  const key = [...new Set(propertyIds.filter(Boolean))].sort().join(",");
  const query = useQuery({
    queryKey: ["channel-manager-entitlements", key],
    enabled: key.length > 0,
    staleTime: 15_000,
    refetchOnMount: "always",
    queryFn: () => fetchChannelManagerEntitlements(key.split(",")),
  });

  return {
    map: query.data ?? new Map<string, boolean>(),
    loading: query.isLoading || query.isPending,
  };
}
