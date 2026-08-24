/**
 * Payment-gateway fee schedule resolution.
 *
 * A gateway schedule (`gateway_billing_configs`) is a versioned commercial
 * record: model, base percentage, per-transaction fixed fee, monthly platform
 * fee and optional volume bands. Every surface that quotes or charges a gateway
 * fee — booking surcharge, payout deduction, expected-billing preview, contract
 * clause — must resolve through `getEffectiveBillingRate` so the quoted number
 * and the invoiced number can never drift.
 *
 * Pure functions only; the async loader at the bottom is the single place that
 * reads the database (property override → portfolio → active global schedule).
 */

import { supabase } from "@/integrations/supabase/client";

export const GATEWAY_BILLING_MODELS = ["flat", "hybrid", "volume_tiered", "passthrough_plus"] as const;
export type GatewayBillingModel = (typeof GATEWAY_BILLING_MODELS)[number];

export const GATEWAY_MODEL_LABELS: Record<GatewayBillingModel, string> = {
  flat: "Flat percentage",
  hybrid: "Hybrid (percentage + fixed fee)",
  volume_tiered: "Volume tiered",
  passthrough_plus: "Cost pass-through plus markup",
};

/** Underlying acquirer cost we price against (PayFast aggregation). */
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
  is_active?: boolean | null;
  effective_from?: string | null;
  model?: string | null;
  base_percentage?: number | null;
  fixed_fee_per_txn?: number | null;
  monthly_platform_fee?: number | null;
  passthrough_markup_percentage?: number | null;
  volume_tiers?: unknown;
  currency?: string | null;
  notes?: string | null;
}

export interface GatewayRateOverrides {
  gateway_percentage_override?: number | null;
  gateway_fixed_fee_override?: number | null;
}

export interface EffectiveBillingRate {
  model: GatewayBillingModel;
  /** Percentage of the processed amount. */
  percentage: number;
  /** Fixed amount per transaction. */
  fixed_fee: number;
  /** Monthly platform fee attached to the schedule (hybrid models). */
  monthly_fee: number;
  /**
   * Blended percentage for `amount` — percentage plus the fixed fee expressed
   * as a percentage of the amount. Equals `percentage` when amount is 0.
   */
  effective_rate: number;
  /** Money charged on a transaction of `amount`. */
  amount_charged: number;
  config_version: number | null;
  config_id: string | null;
  config_name: string | null;
  currency: string;
  /** The band that applied, when the model is volume-banded. */
  tier: GatewayVolumeTier | null;
  /** True when a property/portfolio override replaced a schedule value. */
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

/** Parse and sort the stored `volume_tiers` jsonb into usable bands. */
export function normalizeVolumeTiers(input: unknown): GatewayVolumeTier[] {
  const raw = typeof input === "string" ? safeParse(input) : input;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): GatewayVolumeTier | null => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      const min = num(r.min_monthly_volume) ?? 0;
      const max = num(r.max_monthly_volume);
      const pct = num(r.percentage);
      if (pct == null) return null;
      return {
        min_monthly_volume: min,
        max_monthly_volume: max,
        percentage: pct,
        fixed_fee: num(r.fixed_fee),
      };
    })
    .filter((t): t is GatewayVolumeTier => t !== null)
    .sort((a, b) => a.min_monthly_volume - b.min_monthly_volume);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Band whose range contains `volume`; the last band catches everything above. */
export function resolveVolumeTier(tiers: GatewayVolumeTier[], volume: number): GatewayVolumeTier | null {
  if (!tiers.length) return null;
  const v = Number.isFinite(volume) ? Math.max(0, volume) : 0;
  for (const tier of tiers) {
    const max = tier.max_monthly_volume ?? Number.POSITIVE_INFINITY;
    if (v >= tier.min_monthly_volume && v <= max) return tier;
  }
  return v < tiers[0].min_monthly_volume ? tiers[0] : tiers[tiers.length - 1];
}

/** Plain-language one-line summary of the bands, used in contracts. */
export function summariseVolumeTiers(tiers: GatewayVolumeTier[], currency = "ZAR"): string {
  if (!tiers.length) return "";
  const cur = currency === "ZAR" ? "R" : `${currency} `;
  const money = (n: number) => `${cur}${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
  return tiers
    .map((t) => {
      const band =
        t.max_monthly_volume == null
          ? `${money(t.min_monthly_volume)} and above`
          : `${money(t.min_monthly_volume)} – ${money(t.max_monthly_volume)}`;
      const fee = t.fixed_fee ? ` + ${money(t.fixed_fee)} per transaction` : "";
      return `${band}: ${t.percentage}%${fee}`;
    })
    .join("; ");
}

/**
 * Resolve the fee that applies to one transaction.
 *
 * @param config       the gateway schedule (null → zero-rated result)
 * @param amount       transaction amount, used for `effective_rate`
 * @param periodVolume processed volume for the billing period, used to pick a band
 * @param overrides    property/portfolio level overrides
 */
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

/** True when the schedule at least recovers the acquirer cost on `amount`. */
export function coversAcquirerCost(rate: EffectiveBillingRate, amount: number): boolean {
  const cost = amount * (PAYFAST_COST_PERCENTAGE / 100) + PAYFAST_COST_FIXED_FEE;
  return rate.amount_charged >= cost;
}

export interface ResolvedGatewaySchedule {
  config: GatewayBillingConfig | null;
  overrides: GatewayRateOverrides;
  /** Where the schedule came from. */
  source: "property" | "portfolio" | "global" | "none";
}

/**
 * Load the schedule that applies to a property: its own assignment, then its
 * portfolio's, then the active global schedule. Overrides always come from the
 * level that supplied the schedule.
 */
export async function loadGatewaySchedule(propertyId: string): Promise<ResolvedGatewaySchedule> {
  const SELECT = "gateway_billing_config_id, gateway_percentage_override, gateway_fixed_fee_override";

  const [propRes, memberRes] = await Promise.all([
    supabase.from("property_billing_configs").select(SELECT).eq("property_id", propertyId).maybeSingle(),
    supabase.from("property_portfolio_members").select("portfolio_id").eq("property_id", propertyId).maybeSingle(),
  ]);

  const propRow = propRes.data as (GatewayRateOverrides & { gateway_billing_config_id?: string | null }) | null;
  let source: ResolvedGatewaySchedule["source"] = "global";
  let configId = propRow?.gateway_billing_config_id ?? null;
  let overrides: GatewayRateOverrides = {
    gateway_percentage_override: propRow?.gateway_percentage_override ?? null,
    gateway_fixed_fee_override: propRow?.gateway_fixed_fee_override ?? null,
  };
  if (configId) source = "property";

  const portfolioId = (memberRes.data as { portfolio_id?: string } | null)?.portfolio_id ?? null;
  if (!configId && portfolioId) {
    const { data: pf } = await supabase
      .from("portfolio_billing_configs")
      .select(SELECT)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    const pfRow = pf as (GatewayRateOverrides & { gateway_billing_config_id?: string | null }) | null;
    if (pfRow?.gateway_billing_config_id) {
      configId = pfRow.gateway_billing_config_id;
      source = "portfolio";
      overrides = {
        gateway_percentage_override: pfRow.gateway_percentage_override ?? null,
        gateway_fixed_fee_override: pfRow.gateway_fixed_fee_override ?? null,
      };
    }
  }

  const query = supabase.from("gateway_billing_configs").select("*").limit(1);
  const { data } = configId
    ? await query.eq("id", configId)
    : await query.eq("is_active", true).order("version", { ascending: false });

  const config = ((data as GatewayBillingConfig[] | null) || [])[0] ?? null;
  return { config, overrides, source: config ? source : "none" };
}

/** Fetch every schedule, newest version first — admin surfaces. */
export async function listGatewaySchedules(): Promise<GatewayBillingConfig[]> {
  const { data } = await supabase
    .from("gateway_billing_configs")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .order("version", { ascending: false });
  return (data as GatewayBillingConfig[] | null) || [];
}

/**
 * Processed volume for a property over the trailing `days`, used for banding.
 * Payments are keyed to bookings, so volume is the paid booking value in the
 * period.
 */
export async function loadPeriodVolume(propertyId: string, days = 30): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("bookings")
    .select("total_price, payment_status, created_at")
    .eq("property_id", propertyId)
    .gte("created_at", since);
  return ((data as Array<{ total_price: number | null; payment_status: string | null }> | null) || [])
    .filter((r) => ["paid", "completed", "partially_paid"].includes(String(r.payment_status ?? "").toLowerCase()))
    .reduce((sum, r) => sum + (Number(r.total_price) || 0), 0);
}
