import { supabase } from "@/integrations/supabase/client";

export type TierLabel = "xs" | "s" | "m" | "l";

export interface PricingTier {
  min_rooms: number;
  max_rooms: number | null;
  /** Deprecated — retained for backwards compatibility. Always null in the new model. */
  max_properties: number | null;
  /** Base monthly fee. Always a fixed number in the new room-count model. */
  monthly_fee: number | null;
  /** Optional label used to identify tier rows. */
  label?: TierLabel;
}

/**
 * PMS subscription tiers are driven purely by TOTAL ROOM COUNT (across the
 * property or its portfolio). Property count is no longer a gating factor.
 *
 *   0 – 9 rooms   · R450 / month
 *   10 – 19 rooms · R600 / month
 *   20 – 50 rooms · R750 / month
 *   51+ rooms     · R925 / month
 */
export const DEFAULT_TIERS: PricingTier[] = [
  { min_rooms: 0, max_rooms: 9, max_properties: null, monthly_fee: 450, label: "xs" },
  { min_rooms: 10, max_rooms: 19, max_properties: null, monthly_fee: 600, label: "s" },
  { min_rooms: 20, max_rooms: 50, max_properties: null, monthly_fee: 750, label: "m" },
  { min_rooms: 51, max_rooms: null, max_properties: null, monthly_fee: 925, label: "l" },
];

export const TIER_STRATEGIES = ["rolos_pms", "volume_tiered"] as const;
export type TierStrategy = (typeof TIER_STRATEGIES)[number];

export function isTierStrategy(strategy: string | null | undefined): strategy is TierStrategy {
  return !!strategy && (TIER_STRATEGIES as readonly string[]).includes(strategy);
}

/**
 * Resolve the applicable tier from total room count. Property count is
 * ignored under the new pricing model.
 */
export function resolveTier(rooms: number, tiers: PricingTier[], _properties: number = 1): PricingTier | null {
  const sorted = [...tiers].sort((a, b) => {
    const ar = a.max_rooms ?? Number.POSITIVE_INFINITY;
    const br = b.max_rooms ?? Number.POSITIVE_INFINITY;
    return ar - br;
  });
  for (const t of sorted) {
    const min = t.min_rooms ?? 0;
    const max = t.max_rooms ?? Number.POSITIVE_INFINITY;
    if (rooms >= min && rooms <= max) return t;
  }
  return sorted[sorted.length - 1] ?? null;
}

export function normalizeTiers(input: unknown): PricingTier[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): PricingTier | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const min = Number(r.min_rooms);
      const max = r.max_rooms == null || r.max_rooms === "" ? null : Number(r.max_rooms);
      const maxProps = r.max_properties == null || r.max_properties === "" ? null : Number(r.max_properties);
      // Accept null / "" / undefined monthly_fee (Enterprise = custom)
      const rawFee = r.monthly_fee;
      const fee = rawFee == null || rawFee === "" ? null : Number(rawFee);
      const label = typeof r.label === "string" ? (r.label as TierLabel) : undefined;
      if (!Number.isFinite(min)) return null;
      if (fee !== null && !Number.isFinite(fee)) return null;
      if (max !== null && !Number.isFinite(max)) return null;
      if (maxProps !== null && !Number.isFinite(maxProps)) return null;
      // Enterprise heuristic: unlimited properties → fee treated as custom (null) even if 0/legacy stored
      const normalizedFee = maxProps == null && (fee === 0 || fee == null) ? null : fee;
      return { min_rooms: min, max_rooms: max, max_properties: maxProps, monthly_fee: normalizedFee, label };
    })
    .filter((t): t is PricingTier => t !== null);
}

/** Total sellable units for one property, using whichever room-inventory source is populated. */
export async function getPropertyRoomCount(propertyId: string): Promise<number> {
  // Prefer ROLOS physical rooms (one row per sellable unit); fall back to
  // Hostfully unit-types (summed by total_units), then generic PMS cache row count.
  const [rolosRooms, hostfully, pmsCache] = await Promise.all([
    supabase
      .from("rolos_rooms")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId),
    supabase
      .from("hostfully_room_types")
      .select("total_units")
      .eq("property_id", propertyId),
    supabase
      .from("pms_room_types_cache")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId),
  ]);

  const rolosCount = rolosRooms.count ?? 0;
  if (rolosCount > 0) return rolosCount;

  const hostfullyTotal = (hostfully.data as Array<{ total_units: number | null }> | null)
    ?.reduce((sum, row) => sum + (Number(row.total_units) || 0), 0) ?? 0;
  if (hostfullyTotal > 0) return hostfullyTotal;

  return pmsCache.count ?? 0;
}

/** Aggregate room count across all properties in the same portfolio (or single property). */
export async function getPortfolioRoomCount(propertyId: string): Promise<{
  totalRooms: number;
  propertyIds: string[];
  scope: "portfolio" | "property";
}> {
  const { data: membership } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();

  let ids: string[] = [propertyId];
  let scope: "portfolio" | "property" = "property";

  if (membership?.portfolio_id) {
    const { data: siblings } = await supabase
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", membership.portfolio_id);
    if (siblings?.length) {
      ids = Array.from(new Set(siblings.map((s: any) => s.property_id as string)));
      scope = "portfolio";
    }
  }

  const counts = await Promise.all(ids.map((id) => getPropertyRoomCount(id)));
  return {
    totalRooms: counts.reduce((a, b) => a + b, 0),
    propertyIds: ids,
    scope,
  };
}

export interface ResolvedTierInfo {
  tier: PricingTier | null;
  rooms: number;
  properties: number;
  scope: "portfolio" | "property";
  usedOverride: boolean;
  usedGlobalTiers: boolean;
  /** True when the resolved tier's max_properties cap is exceeded. */
  bumpedByPropertyCount: boolean;
  /** Convenience label for the resolved tier. */
  tierLabel: TierLabel | null;
  /** Custom monthly fee set by admin (used when tier requires one, e.g. Enterprise). */
  enterpriseCustomFee: number | null;
  /**
   * Fee that should actually be charged this month. `null` when the resolved
   * tier requires a custom amount and no override has been set yet.
   */
  effectiveMonthlyFee: number | null;
  /** True when the resolved tier has no fixed fee AND no custom override was found. */
  requiresCustomFee: boolean;
}

/** Count active properties in the same portfolio as `propertyId` (or 1 if standalone). */
export async function getPortfolioPropertyCount(propertyId: string): Promise<{ count: number; scope: "portfolio" | "property" }> {
  const { data: membership } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!membership?.portfolio_id) return { count: 1, scope: "property" };

  const { data: siblings } = await supabase
    .from("property_portfolio_members")
    .select("property_id")
    .eq("portfolio_id", membership.portfolio_id);
  const ids = Array.from(new Set((siblings ?? []).map((s: any) => s.property_id as string)));
  if (!ids.length) return { count: 1, scope: "property" };

  const { data: active } = await supabase
    .from("properties")
    .select("id")
    .in("id", ids)
    .eq("is_active", true);
  return { count: active?.length ?? ids.length, scope: "portfolio" };
}

function inferLabel(tier: PricingTier | null): TierLabel | null {
  if (!tier) return null;
  if (tier.label) return tier.label;
  const max = tier.max_rooms;
  if (max == null) return "l";
  if (max <= 9) return "xs";
  if (max <= 19) return "s";
  if (max <= 50) return "m";
  return "l";
}

/** Full resolution: reads override tiers → global tiers, override room count → live count. */
export async function resolvePropertyTier(propertyId: string): Promise<ResolvedTierInfo> {
  const [configRes, globalsRes] = await Promise.all([
    supabase
      .from("property_billing_configs")
      .select("billing_strategy, tier_pricing_json, tier_scope, room_count_override, enterprise_custom_fee")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("billing_global_defaults")
      .select("strategy, tier_pricing_json, enterprise_custom_fee")
      .in("strategy", [...TIER_STRATEGIES]),
  ]);

  const config = configRes.data as any;
  const strategy = config?.billing_strategy || "default";
  const global = (globalsRes.data as any[] | null)?.find((g) => g.strategy === strategy);

  const overrideTiers = normalizeTiers(config?.tier_pricing_json);
  const globalTiers = normalizeTiers(global?.tier_pricing_json);
  const tiers = overrideTiers.length ? overrideTiers : globalTiers.length ? globalTiers : DEFAULT_TIERS;

  const wantsPortfolio = (config?.tier_scope ?? "portfolio") === "portfolio";
  let rooms = 0;
  let scope: "portfolio" | "property" = "property";

  if (config?.room_count_override != null && Number.isFinite(Number(config.room_count_override))) {
    rooms = Number(config.room_count_override);
    scope = wantsPortfolio ? "portfolio" : "property";
  } else if (wantsPortfolio) {
    const r = await getPortfolioRoomCount(propertyId);
    rooms = r.totalRooms;
    scope = r.scope;
  } else {
    rooms = await getPropertyRoomCount(propertyId);
    scope = "property";
  }

  const propInfo = wantsPortfolio
    ? await getPortfolioPropertyCount(propertyId)
    : { count: 1, scope: "property" as const };
  const properties = propInfo.count;

  const tier = resolveTier(rooms, tiers, properties);
  const bumpedByPropertyCount = !!tier && tier.max_properties != null && properties > tier.max_properties;
  const tierLabel = inferLabel(tier);

  const rawCustom = config?.enterprise_custom_fee ?? global?.enterprise_custom_fee ?? null;
  const enterpriseCustomFee =
    rawCustom != null && Number.isFinite(Number(rawCustom)) ? Number(rawCustom) : null;

  const tierFee = tier?.monthly_fee ?? null;
  const effectiveMonthlyFee = tierFee != null ? tierFee : enterpriseCustomFee;
  const requiresCustomFee = tierFee == null && effectiveMonthlyFee == null;

  return {
    tier,
    rooms,
    properties,
    scope,
    usedOverride: overrideTiers.length > 0,
    usedGlobalTiers: overrideTiers.length === 0 && globalTiers.length > 0,
    bumpedByPropertyCount,
    tierLabel,
    enterpriseCustomFee,
    effectiveMonthlyFee,
    requiresCustomFee,
  };
}

