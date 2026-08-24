/**
 * Edge-side mirror of `src/lib/gatewayBillingRate.ts` — same maths, no client.
 * Keep the pure functions in this file byte-identical in behaviour to the
 * frontend copy so a quoted fee and an invoiced fee can never diverge.
 */

export const GATEWAY_BILLING_MODELS = ["flat", "hybrid", "volume_tiered", "passthrough_plus"] as const;
export type GatewayBillingModel = (typeof GATEWAY_BILLING_MODELS)[number];

export const PAYFAST_COST_PERCENTAGE = 3.2;
export const PAYFAST_COST_FIXED_FEE = 2;

export interface GatewayVolumeTier {
  min_monthly_volume: number;
  max_monthly_volume: number | null;
  percentage: number;
  fixed_fee: number | null;
}

export interface GatewayBillingConfig {
  id?: string;
  name?: string | null;
  version?: number | null;
  model?: string | null;
  base_percentage?: number | null;
  fixed_fee_per_txn?: number | null;
  monthly_platform_fee?: number | null;
  passthrough_markup_percentage?: number | null;
  volume_tiers?: unknown;
  currency?: string | null;
}

export interface GatewayRateOverrides {
  gateway_percentage_override?: number | null;
  gateway_fixed_fee_override?: number | null;
}

export interface EffectiveBillingRate {
  model: GatewayBillingModel;
  percentage: number;
  fixed_fee: number;
  monthly_fee: number;
  effective_rate: number;
  amount_charged: number;
  config_version: number | null;
  config_id: string | null;
  config_name: string | null;
  currency: string;
  tier: GatewayVolumeTier | null;
  usedOverride: boolean;
}

const num = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function normalizeGatewayModel(value: unknown): GatewayBillingModel {
  const v = String(value ?? "flat").toLowerCase();
  return (GATEWAY_BILLING_MODELS as readonly string[]).includes(v) ? (v as GatewayBillingModel) : "flat";
}

export function normalizeVolumeTiers(input: unknown): GatewayVolumeTier[] {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): GatewayVolumeTier | null => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      const pct = num(r.percentage);
      if (pct == null) return null;
      return {
        min_monthly_volume: num(r.min_monthly_volume) ?? 0,
        max_monthly_volume: num(r.max_monthly_volume),
        percentage: pct,
        fixed_fee: num(r.fixed_fee),
      };
    })
    .filter((t): t is GatewayVolumeTier => t !== null)
    .sort((a, b) => a.min_monthly_volume - b.min_monthly_volume);
}

export function resolveVolumeTier(tiers: GatewayVolumeTier[], volume: number): GatewayVolumeTier | null {
  if (!tiers.length) return null;
  const v = Number.isFinite(volume) ? Math.max(0, volume) : 0;
  for (const tier of tiers) {
    const max = tier.max_monthly_volume ?? Number.POSITIVE_INFINITY;
    if (v >= tier.min_monthly_volume && v <= max) return tier;
  }
  return v < tiers[0].min_monthly_volume ? tiers[0] : tiers[tiers.length - 1];
}

export function getEffectiveBillingRate(
  config: GatewayBillingConfig | null | undefined,
  amount = 0,
  periodVolume?: number | null,
  overrides?: GatewayRateOverrides | null,
): EffectiveBillingRate {
  const model = normalizeGatewayModel(config?.model);
  const tiers = normalizeVolumeTiers(config?.volume_tiers);
  const banded = model === "volume_tiered" || model === "hybrid";
  const tier = banded ? resolveVolumeTier(tiers, num(periodVolume) ?? 0) : null;

  let percentage = tier?.percentage ?? num(config?.base_percentage) ?? 0;
  let fixedFee = model === "flat" ? 0 : tier?.fixed_fee ?? num(config?.fixed_fee_per_txn) ?? 0;

  if (model === "passthrough_plus") {
    const markup = num(config?.passthrough_markup_percentage) ?? 0;
    percentage = PAYFAST_COST_PERCENTAGE + markup;
    fixedFee = num(config?.fixed_fee_per_txn) ?? PAYFAST_COST_FIXED_FEE;
  }

  const pctOverride = num(overrides?.gateway_percentage_override);
  const feeOverride = num(overrides?.gateway_fixed_fee_override);
  const usedOverride = pctOverride != null || feeOverride != null;
  if (pctOverride != null) percentage = pctOverride;
  if (feeOverride != null) fixedFee = feeOverride;

  const txnAmount = Math.max(0, num(amount) ?? 0);
  const charged = txnAmount > 0 ? txnAmount * (percentage / 100) + fixedFee : 0;
  const effectiveRate = txnAmount > 0 ? (charged / txnAmount) * 100 : percentage;

  return {
    model,
    percentage,
    fixed_fee: fixedFee,
    monthly_fee: num(config?.monthly_platform_fee) ?? 0,
    effective_rate: round2(effectiveRate),
    amount_charged: round2(charged),
    config_version: num(config?.version),
    config_id: config?.id ?? null,
    config_name: config?.name ?? null,
    currency: config?.currency || "ZAR",
    tier,
    usedOverride,
  };
}

/**
 * Resolve the schedule for a property: property assignment → portfolio
 * assignment → active global schedule. `supabase` is a service-role client.
 */
export async function loadGatewaySchedule(
  supabase: any,
  propertyId: string,
): Promise<{ config: GatewayBillingConfig | null; overrides: GatewayRateOverrides; source: string }> {
  const SELECT = "gateway_billing_config_id, gateway_percentage_override, gateway_fixed_fee_override";

  const [propRes, memberRes] = await Promise.all([
    supabase.from("property_billing_configs").select(SELECT).eq("property_id", propertyId).maybeSingle(),
    supabase.from("property_portfolio_members").select("portfolio_id").eq("property_id", propertyId).maybeSingle(),
  ]);

  const propRow = propRes?.data as any;
  let source = "global";
  let configId: string | null = propRow?.gateway_billing_config_id ?? null;
  let overrides: GatewayRateOverrides = {
    gateway_percentage_override: propRow?.gateway_percentage_override ?? null,
    gateway_fixed_fee_override: propRow?.gateway_fixed_fee_override ?? null,
  };
  if (configId) source = "property";

  const portfolioId = (memberRes?.data as any)?.portfolio_id ?? null;
  if (!configId && portfolioId) {
    const { data: pf } = await supabase
      .from("portfolio_billing_configs")
      .select(SELECT)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (pf?.gateway_billing_config_id) {
      configId = pf.gateway_billing_config_id as string;
      source = "portfolio";
      overrides = {
        gateway_percentage_override: pf.gateway_percentage_override ?? null,
        gateway_fixed_fee_override: pf.gateway_fixed_fee_override ?? null,
      };
    }
  }

  let query = supabase.from("gateway_billing_configs").select("*").limit(1);
  query = configId ? query.eq("id", configId) : query.eq("is_active", true).order("version", { ascending: false });
  const { data } = await query;
  const config = ((data as GatewayBillingConfig[] | null) || [])[0] ?? null;
  return { config, overrides, source: config ? source : "none" };
}

/** Paid booking value for a property over the trailing `days` — banding input. */
export async function loadPeriodVolume(supabase: any, propertyId: string, days = 30): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("bookings")
    .select("total_price, payment_status, created_at")
    .eq("property_id", propertyId)
    .gte("created_at", since);
  return ((data as any[]) || [])
    .filter((r) => ["paid", "completed", "partially_paid"].includes(String(r?.payment_status ?? "").toLowerCase()))
    .reduce((sum, r) => sum + (Number(r?.total_price) || 0), 0);
}

/**
 * A schedule is billable whenever one resolved — including the active global
 * schedule. Only `none` (no active schedule at all) falls back to the legacy
 * flat facilitator percentage.
 */
export function isBillableScheduleSource(source: string | null | undefined): boolean {
  return source === "property" || source === "portfolio" || source === "global";
}
