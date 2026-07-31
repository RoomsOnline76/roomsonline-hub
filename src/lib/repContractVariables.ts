import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TIER_CRITERIA, RepTierCriteria } from "@/components/admin/billing/TierCriteriaEditor";
import { numberToWords, ratePhrase } from "@/lib/contractBillingVariables";

export type RepTierKey = "base" | "accelerated" | "elite";

export const REP_TIER_LABELS: Record<RepTierKey, string> = {
  base: "Base",
  accelerated: "Accelerated",
  elite: "Elite",
};

export interface RepLike {
  id?: string;
  display_name?: string | null;
  email?: string | null;
  rep_code?: string | null;
  commission_tier?: string | null;
}

export interface ResolvedRepTerms {
  tier: RepTierKey;
  tier_label: string;
  first_year_rate: number;
  residual_rate: number;
  residual_months: number;
  clawback_days: number;
  /** Where the rates came from. */
  source: "tier_criteria" | "global_default" | "constant";
}

export interface RepContractVariables extends Record<string, string> {
  rep_name: string;
  rep_email: string;
  rep_code: string;
  commission_tier_label: string;
  first_year_rate: string;
  residual_rate: string;
  residual_duration: string;
  clawback_period: string;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const normTier = (v: unknown): RepTierKey => {
  const t = String(v ?? "base").toLowerCase();
  return t === "accelerated" || t === "elite" ? (t as RepTierKey) : "base";
};

/**
 * Resolve a rep's commission economics from the global billing defaults.
 * Cascade: sales_rep_tier_criteria_json[tier] → billing_global_defaults.referral_*
 * → platform constants.
 */
export function resolveRepTerms(
  rep: RepLike | null | undefined,
  globals: Record<string, any> | null | undefined,
): ResolvedRepTerms {
  const tier = normTier(rep?.commission_tier);
  const criteria = (globals?.sales_rep_tier_criteria_json as RepTierCriteria | undefined) || undefined;
  const tierRow = criteria?.[tier];

  const firstFromTier = num(tierRow?.first_year_rate);
  const residualFromTier = num(tierRow?.residual_rate);

  const firstYear =
    firstFromTier ?? num(globals?.referral_first_year_rate) ?? DEFAULT_TIER_CRITERIA[tier].first_year_rate;
  const residual =
    residualFromTier ?? num(globals?.referral_residual_rate) ?? DEFAULT_TIER_CRITERIA[tier].residual_rate;
  const months = num(globals?.referral_residual_months) ?? 24;
  const clawback = num(globals?.referral_clawback_days) ?? 90;

  const source: ResolvedRepTerms["source"] =
    firstFromTier != null || residualFromTier != null
      ? "tier_criteria"
      : num(globals?.referral_first_year_rate) != null
      ? "global_default"
      : "constant";

  return {
    tier,
    tier_label: REP_TIER_LABELS[tier],
    first_year_rate: firstYear,
    residual_rate: residual,
    residual_months: months,
    clawback_days: clawback,
    source,
  };
}

/** Fetch the global defaults row used for rep economics (generic `default` preset first). */
export async function fetchRepGlobals(): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("billing_global_defaults")
    .select("*")
    .order("sort_order", { ascending: true });
  const rows = (data as any[]) || [];
  if (!rows.length) return null;
  return (
    rows.find((r) => r.sales_rep_tier_criteria_json) ||
    rows.find((r) => String(r.strategy || "").toLowerCase() === "default") ||
    rows[0]
  );
}

export function repTermsToVariables(rep: RepLike | null | undefined, terms: ResolvedRepTerms): RepContractVariables {
  return {
    rep_name: rep?.display_name || "N/A",
    rep_email: rep?.email || "N/A",
    rep_code: rep?.rep_code || "N/A",
    commission_tier_label: terms.tier_label,
    first_year_rate: ratePhrase(terms.first_year_rate),
    residual_rate: ratePhrase(terms.residual_rate),
    residual_duration: `${numberToWords(terms.residual_months)} (${terms.residual_months}) months`,
    clawback_period: `${numberToWords(terms.clawback_days)} (${terms.clawback_days}) days`,
  };
}

/**
 * Resolve referral-contract variables for a rep identified by id or email.
 * Returns null when no matching sales rep exists (so the caller can leave the
 * placeholders untouched instead of writing wrong numbers into a contract).
 */
export async function resolveRepContractVariables(opts: {
  repId?: string | null;
  email?: string | null;
}): Promise<{ rep: RepLike; terms: ResolvedRepTerms; variables: RepContractVariables } | null> {
  const { repId, email } = opts;
  if (!repId && !email) return null;

  let q = supabase.from("sales_reps").select("id, display_name, email, rep_code, commission_tier").limit(1);
  q = repId ? q.eq("id", repId) : q.ilike("email", (email || "").trim());

  const [{ data: repRows }, globals] = await Promise.all([q, fetchRepGlobals()]);
  const rep = ((repRows as any[]) || [])[0] as RepLike | undefined;
  if (!rep) return null;

  const terms = resolveRepTerms(rep, globals);
  return { rep, terms, variables: repTermsToVariables(rep, terms) };
}
