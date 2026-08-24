import { describe, it, expect } from "vitest";
import { buildRepCommissionEstimate, resolveRepTierRates } from "./repCommissionEstimate";
import type { BillingEstimate, EstimateLine } from "./billingEstimate";

const line = (key: string, steadyState: number, group: "transaction" | "recurring"): EstimateLine => ({
  key,
  label: key,
  detail: "",
  group,
  freePeriod: group === "transaction" ? steadyState : 0,
  steadyState,
  waivedInFreePeriod: group === "recurring",
});

const estimate = {
  lines: [
    line("commission", 10000, "transaction"),
    line("widget_commission", 3000, "transaction"),
    line("processing", 2100, "transaction"),
    line("processing_platform", 199, "recurring"),
    line("pms", 750, "recurring"),
    line("channel_manager", 600, "recurring"),
  ],
} as unknown as BillingEstimate;

describe("repCommissionEstimate", () => {
  it("excludes card processing and platform fees from the base", () => {
    const e = buildRepCommissionEstimate(estimate, null);
    expect(e.rows.map((r) => r.key)).toEqual(["commission", "widget_commission", "pms", "channel_manager"]);
    expect(e.baseTotal).toBe(10000 + 3000 + 750 + 600);
  });

  it("falls back to platform tier constants", () => {
    const rates = resolveRepTierRates(null);
    expect(rates.map((r) => r.firstYearRate)).toEqual([20, 25, 30]);
    expect(rates.map((r) => r.residualRate)).toEqual([5, 7.5, 10]);
    expect(rates[0].source).toBe("constant");
  });

  it("prefers preset tier criteria over referral defaults", () => {
    const rates = resolveRepTierRates({
      referral_first_year_rate: 15,
      referral_residual_rate: 3,
      sales_rep_tier_criteria_json: {
        base: { min_props: 0, min_mrr: 0, first_year_rate: 22, residual_rate: 6, notes: "" },
        accelerated: { min_props: 1, min_mrr: 0, first_year_rate: 27, residual_rate: 8, notes: "" },
        elite: { min_props: 2, min_mrr: 0, first_year_rate: 33, residual_rate: 11, notes: "" },
      },
    });
    expect(rates[0].firstYearRate).toBe(22);
    expect(rates[2].residualRate).toBe(11);
    expect(rates[0].source).toBe("tier_criteria");
  });

  it("uses preset referral defaults when no tier criteria exist", () => {
    const rates = resolveRepTierRates({ referral_first_year_rate: 15, referral_residual_rate: 3 });
    expect(rates.every((r) => r.firstYearRate === 15 && r.residualRate === 3)).toBe(true);
    expect(rates[1].source).toBe("preset_default");
  });

  it("totals monthly, first-year and residual earnings per tier", () => {
    const e = buildRepCommissionEstimate(estimate, { referral_residual_months: 12 });
    const base = e.baseTotal;
    expect(e.totals.base.firstYear).toBeCloseTo(base * 0.2, 5);
    expect(e.totals.base.firstYearTotal).toBeCloseTo(base * 0.2 * 12, 5);
    expect(e.totals.elite.residualTotal).toBeCloseTo(base * 0.1 * 12, 5);
    expect(e.residualMonths).toBe(12);
  });

  it("splits each revenue line across the three tiers", () => {
    const e = buildRepCommissionEstimate(estimate, null);
    const row = e.rows.find((r) => r.key === "commission")!;
    expect(row.byTier.base.firstYear).toBeCloseTo(2000, 5);
    expect(row.byTier.elite.residual).toBeCloseTo(1000, 5);
  });
});
