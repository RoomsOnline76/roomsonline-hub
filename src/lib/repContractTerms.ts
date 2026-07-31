import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TIER_CRITERIA, RepTierCriteria } from "@/components/admin/billing/TierCriteriaEditor";

export type RepTierKey = keyof RepTierCriteria;

export interface RepCommissionTerms {
  tier: RepTierKey;
  tier_label: string;
  first_year_rate: number;
  residual_rate: number;
  residual_months: number;
  clawback_days: number;
  quarterly_target: number | null;
  /** Where each rate came from — useful for audit trails. */
  source: "tier_criteria" | "billing_defaults" | "fallback";
}

export const TIER_LABELS: Record<RepTierKey, string> = {
  base: "Base",
  accelerated: "Accelerated",
  elite: "Elite",
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve the commission terms in force for a rep tier, straight from
 * Admin → Billing Defaults. No rates are hardcoded here beyond the shared
 * DEFAULT_TIER_CRITERIA fallback used by the billing defaults editor itself.
 */
export async function resolveRepCommissionTerms(
  tier: RepTierKey,
  quarterlyTarget?: number | null,
): Promise<RepCommissionTerms> {
  const { data } = await supabase
    .from("billing_global_defaults")
    .select(
      "strategy, sales_rep_tier_criteria_json, referral_first_year_rate, referral_residual_rate, referral_residual_months, referral_clawback_days",
    );

  const rows = (data || []) as Record<string, any>[];
  const preferred = rows.find((r) => r.strategy === "default") || rows[0] || null;
  const criteriaRow = rows.find((r) => r.sales_rep_tier_criteria_json) || null;
  const criteria = (criteriaRow?.sales_rep_tier_criteria_json as RepTierCriteria | null) || null;

  const tierRates = criteria?.[tier] || null;
  const baseFirstYear = num(preferred?.referral_first_year_rate);
  const baseResidual = num(preferred?.referral_residual_rate);

  const firstYear =
    num(tierRates?.first_year_rate) ?? baseFirstYear ?? DEFAULT_TIER_CRITERIA[tier].first_year_rate;
  const residual =
    num(tierRates?.residual_rate) ?? baseResidual ?? DEFAULT_TIER_CRITERIA[tier].residual_rate;

  return {
    tier,
    tier_label: TIER_LABELS[tier],
    first_year_rate: firstYear,
    residual_rate: residual,
    residual_months: num(preferred?.referral_residual_months) ?? 12,
    clawback_days: num(preferred?.referral_clawback_days) ?? 90,
    quarterly_target: quarterlyTarget ?? null,
    source: tierRates ? "tier_criteria" : baseFirstYear != null ? "billing_defaults" : "fallback",
  };
}
