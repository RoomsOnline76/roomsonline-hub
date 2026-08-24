/**
 * Sales rep / referral commission estimate.
 *
 * Takes the billing estimate the Cost estimator already computed and works out
 * what a referring rep would earn on it, side by side for all three tiers.
 *
 * Rules:
 *   • Commission is earned on ROL revenue: booking commission, widget
 *     commission, and the recurring subscriptions / add-ons.
 *   • Card processing is a pass-through cost, never a commission base.
 *   • Add-ons are waived in the first 60 days, so nothing is earned on them
 *     until day 61 — the earnings basis is steady-state monthly revenue.
 *   • Rates cascade: preset tier criteria → preset referral defaults → platform
 *     tier constants (the same cascade the rep contracts use).
 */

import { DEFAULT_TIER_CRITERIA, type RepTierCriteria } from "@/components/admin/billing/TierCriteriaEditor";
import type { BillingEstimate, EstimateLine } from "./billingEstimate";

export type RepTierKey = "base" | "accelerated" | "elite";

export const REP_TIER_ORDER: RepTierKey[] = ["base", "accelerated", "elite"];

export const REP_TIER_LABELS: Record<RepTierKey, string> = {
  base: "Base",
  accelerated: "Accelerated",
  elite: "Elite",
};

/** Lines that never form part of the commission base. */
const EXCLUDED_LINE_KEYS = new Set(["processing", "processing_platform", "byo_gateway"]);

export interface RepGlobalsLike {
  sales_rep_tier_criteria_json?: unknown;
  referral_first_year_rate?: number | null;
  referral_residual_rate?: number | null;
  referral_residual_months?: number | null;
}

export interface RepTierRates {
  tier: RepTierKey;
  label: string;
  firstYearRate: number;
  residualRate: number;
  source: "tier_criteria" | "preset_default" | "constant";
}

export interface RepCommissionRow {
  key: string;
  label: string;
  /** Monthly ROL revenue this row is commissionable on (steady state). */
  base: number;
  /** Rep earnings per tier. */
  byTier: Record<RepTierKey, { firstYear: number; residual: number }>;
}

export interface RepCommissionEstimate {
  rows: RepCommissionRow[];
  rates: RepTierRates[];
  residualMonths: number;
  /** Total commissionable monthly revenue. */
  baseTotal: number;
  totals: Record<RepTierKey, { firstYear: number; residual: number; firstYearTotal: number; residualTotal: number }>;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Resolve first-year / residual percentages for every tier. */
export function resolveRepTierRates(globals: RepGlobalsLike | null | undefined): RepTierRates[] {
  const criteria = (globals?.sales_rep_tier_criteria_json as RepTierCriteria | undefined) || undefined;
  const presetFirst = num(globals?.referral_first_year_rate);
  const presetResidual = num(globals?.referral_residual_rate);

  return REP_TIER_ORDER.map((tier) => {
    const row = criteria?.[tier];
    const fromTierFirst = num(row?.first_year_rate);
    const fromTierResidual = num(row?.residual_rate);
    const firstYearRate = fromTierFirst ?? presetFirst ?? DEFAULT_TIER_CRITERIA[tier].first_year_rate;
    const residualRate = fromTierResidual ?? presetResidual ?? DEFAULT_TIER_CRITERIA[tier].residual_rate;
    const source: RepTierRates["source"] =
      fromTierFirst != null || fromTierResidual != null
        ? "tier_criteria"
        : presetFirst != null || presetResidual != null
        ? "preset_default"
        : "constant";
    return { tier, label: REP_TIER_LABELS[tier], firstYearRate, residualRate, source };
  });
}

/** Is this estimate line part of the rep commission base? */
export function isCommissionable(line: EstimateLine): boolean {
  return !EXCLUDED_LINE_KEYS.has(line.key);
}

export function buildRepCommissionEstimate(
  estimate: BillingEstimate,
  globals: RepGlobalsLike | null | undefined,
): RepCommissionEstimate {
  const rates = resolveRepTierRates(globals);
  const residualMonths = num(globals?.referral_residual_months) ?? 24;

  const byTierFor = (base: number) => {
    const out = {} as Record<RepTierKey, { firstYear: number; residual: number }>;
    rates.forEach((r) => {
      out[r.tier] = {
        firstYear: base * (r.firstYearRate / 100),
        residual: base * (r.residualRate / 100),
      };
    });
    return out;
  };

  const rows: RepCommissionRow[] = estimate.lines.filter(isCommissionable).map((l) => ({
    key: l.key,
    label: l.label,
    base: l.steadyState,
    byTier: byTierFor(l.steadyState),
  }));

  const baseTotal = rows.reduce((sum, r) => sum + r.base, 0);

  const totals = {} as RepCommissionEstimate["totals"];
  rates.forEach((r) => {
    const firstYear = baseTotal * (r.firstYearRate / 100);
    const residual = baseTotal * (r.residualRate / 100);
    totals[r.tier] = {
      firstYear,
      residual,
      firstYearTotal: firstYear * 12,
      residualTotal: residual * residualMonths,
    };
  });

  return { rows, rates, residualMonths, baseTotal, totals };
}
