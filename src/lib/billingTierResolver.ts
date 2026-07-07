import { supabase } from "@/integrations/supabase/client";

export interface PricingTier {
  min_rooms: number;
  max_rooms: number | null;
  monthly_fee: number;
}

export const DEFAULT_TIERS: PricingTier[] = [
  { min_rooms: 0, max_rooms: 9, monthly_fee: 350 },
  { min_rooms: 10, max_rooms: 19, monthly_fee: 450 },
  { min_rooms: 20, max_rooms: 50, monthly_fee: 600 },
  { min_rooms: 51, max_rooms: null, monthly_fee: 750 },
];

export const TIER_STRATEGIES = ["rolos_pms", "volume_tiered"] as const;
export type TierStrategy = (typeof TIER_STRATEGIES)[number];

export function isTierStrategy(strategy: string | null | undefined): strategy is TierStrategy {
  return !!strategy && (TIER_STRATEGIES as readonly string[]).includes(strategy);
}

export function resolveTier(rooms: number, tiers: PricingTier[]): PricingTier | null {
  const sorted = [...tiers].sort((a, b) => a.min_rooms - b.min_rooms);
  for (const t of sorted) {
    const withinMax = t.max_rooms == null || rooms <= t.max_rooms;
    if (rooms >= t.min_rooms && withinMax) return t;
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
      const fee = Number(r.monthly_fee);
      const max = r.max_rooms == null || r.max_rooms === "" ? null : Number(r.max_rooms);
      if (!Number.isFinite(min) || !Number.isFinite(fee)) return null;
      if (max !== null && !Number.isFinite(max)) return null;
      return { min_rooms: min, max_rooms: max, monthly_fee: fee };
    })
    .filter((t): t is PricingTier => t !== null);
}

/** Total sellable units for one property, using whichever room-inventory source is populated. */
export async function getPropertyRoomCount(propertyId: string): Promise<number> {
  const [hostfully, pmsCache, rolos] = await Promise.all([
    supabase
      .from("hostfully_room_types")
      .select("number_of_units")
      .eq("property_id", propertyId),
    supabase
      .from("pms_room_types_cache")
      .select("total_units, max_occupancy_units")
      .eq("property_id", propertyId),
    supabase
      .from("rolos_room_types")
      .select("total_units")
      .eq("property_id", propertyId),
  ]);

  const sum = (rows: Array<Record<string, unknown>> | null, keys: string[]): number => {
    if (!rows?.length) return 0;
    let total = 0;
    for (const row of rows) {
      for (const k of keys) {
        const v = Number(row[k]);
        if (Number.isFinite(v) && v > 0) {
          total += v;
          break;
        }
      }
    }
    return total;
  };

  const hostfullyTotal = sum(hostfully.data as any, ["number_of_units"]);
  if (hostfullyTotal > 0) return hostfullyTotal;

  const pmsTotal = sum(pmsCache.data as any, ["total_units", "max_occupancy_units"]);
  if (pmsTotal > 0) return pmsTotal;

  const rolosTotal = sum(rolos.data as any, ["total_units"]);
  return rolosTotal;
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
  scope: "portfolio" | "property";
  usedOverride: boolean;
  usedGlobalTiers: boolean;
}

/** Full resolution: reads override tiers → global tiers, override room count → live count. */
export async function resolvePropertyTier(propertyId: string): Promise<ResolvedTierInfo> {
  const [configRes, globalsRes] = await Promise.all([
    supabase
      .from("property_billing_configs")
      .select("billing_strategy, tier_pricing_json, tier_scope, room_count_override")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("billing_global_defaults")
      .select("strategy, tier_pricing_json")
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

  return {
    tier: resolveTier(rooms, tiers),
    rooms,
    scope,
    usedOverride: overrideTiers.length > 0,
    usedGlobalTiers: overrideTiers.length === 0 && globalTiers.length > 0,
  };
}
