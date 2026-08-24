import { describe, expect, it } from "vitest";
import {
  coversAcquirerCost,
  getEffectiveBillingRate,
  normalizeVolumeTiers,
  resolveVolumeTier,
  summariseVolumeTiers,
  type GatewayBillingConfig,
} from "./gatewayBillingRate";

const TIERS = [
  { min_monthly_volume: 0, max_monthly_volume: 50000, percentage: 3.9, fixed_fee: 2.5 },
  { min_monthly_volume: 50000.01, max_monthly_volume: 250000, percentage: 3.6, fixed_fee: 2 },
  { min_monthly_volume: 250000.01, max_monthly_volume: null, percentage: 3.4, fixed_fee: 1.5 },
];

const HYBRID: GatewayBillingConfig = {
  id: "cfg-1",
  name: "Standard Gateway Schedule",
  version: 1,
  model: "hybrid",
  base_percentage: 3.9,
  fixed_fee_per_txn: 2.5,
  monthly_platform_fee: 0,
  volume_tiers: TIERS,
  currency: "ZAR",
};

describe("flat model", () => {
  it("charges the base percentage and never a fixed fee", () => {
    const r = getEffectiveBillingRate({ model: "flat", base_percentage: 2.5, fixed_fee_per_txn: 5 }, 1000);
    expect(r.percentage).toBe(2.5);
    expect(r.fixed_fee).toBe(0);
    expect(r.amount_charged).toBe(25);
    expect(r.effective_rate).toBe(2.5);
  });

  it("reports the headline percentage when no amount is supplied", () => {
    expect(getEffectiveBillingRate({ model: "flat", base_percentage: 3 }).effective_rate).toBe(3);
  });
});

describe("hybrid and volume-tiered banding", () => {
  it("picks the first band for a low-volume property", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 10000);
    expect(r.percentage).toBe(3.9);
    expect(r.fixed_fee).toBe(2.5);
    expect(r.amount_charged).toBe(41.5);
  });

  it("picks the middle band above R50k", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 120000);
    expect(r.percentage).toBe(3.6);
    expect(r.amount_charged).toBe(38);
  });

  it("picks the top open-ended band", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 900000);
    expect(r.percentage).toBe(3.4);
    expect(r.fixed_fee).toBe(1.5);
  });

  it("holds band boundaries exactly", () => {
    expect(getEffectiveBillingRate(HYBRID, 1000, 50000).percentage).toBe(3.9);
    expect(getEffectiveBillingRate(HYBRID, 1000, 250000).percentage).toBe(3.6);
    expect(getEffectiveBillingRate(HYBRID, 1000, 250000.01).percentage).toBe(3.4);
  });

  it("treats a missing volume as the lowest band", () => {
    expect(getEffectiveBillingRate(HYBRID, 1000).percentage).toBe(3.9);
    expect(getEffectiveBillingRate(HYBRID, 1000, -5).percentage).toBe(3.9);
  });

  it("bands volume_tiered the same way", () => {
    const cfg = { ...HYBRID, model: "volume_tiered" as const };
    expect(getEffectiveBillingRate(cfg, 1000, 300000).percentage).toBe(3.4);
  });

  it("carries the applied band and config version for audit", () => {
    const r = getEffectiveBillingRate(HYBRID, 500, 60000);
    expect(r.tier?.percentage).toBe(3.6);
    expect(r.config_version).toBe(1);
    expect(r.config_id).toBe("cfg-1");
  });
});

describe("passthrough plus", () => {
  it("adds the markup to the acquirer cost", () => {
    const r = getEffectiveBillingRate({ model: "passthrough_plus", passthrough_markup_percentage: 0.5 }, 1000);
    expect(r.percentage).toBeCloseTo(3.7, 6);
    expect(r.fixed_fee).toBe(2);
    expect(r.amount_charged).toBe(39);
  });
});

describe("overrides", () => {
  it("a percentage override replaces the resolved band rate", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 900000, { gateway_percentage_override: 2 });
    expect(r.percentage).toBe(2);
    expect(r.fixed_fee).toBe(1.5);
    expect(r.usedOverride).toBe(true);
  });

  it("a fixed-fee override of zero is honoured", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 10000, { gateway_fixed_fee_override: 0 });
    expect(r.fixed_fee).toBe(0);
    expect(r.amount_charged).toBe(39);
  });

  it("no overrides leaves the schedule untouched", () => {
    const r = getEffectiveBillingRate(HYBRID, 1000, 10000, {
      gateway_percentage_override: null,
      gateway_fixed_fee_override: null,
    });
    expect(r.usedOverride).toBe(false);
  });
});

describe("safety and helpers", () => {
  it("zero-rates a null schedule", () => {
    const r = getEffectiveBillingRate(null, 1000);
    expect(r.amount_charged).toBe(0);
    expect(r.percentage).toBe(0);
  });

  it("charges nothing on a zero-value transaction", () => {
    expect(getEffectiveBillingRate(HYBRID, 0, 10000).amount_charged).toBe(0);
  });

  it("the seeded default recovers the PayFast cost on a small ticket", () => {
    const rate = getEffectiveBillingRate(HYBRID, 250, 10000);
    expect(coversAcquirerCost(rate, 250)).toBe(true);
  });

  it("normalises and sorts stored bands, dropping unusable rows", () => {
    const rows = normalizeVolumeTiers([
      { min_monthly_volume: 100, percentage: "2" },
      { min_monthly_volume: 0, percentage: 1, fixed_fee: "1.5" },
      { min_monthly_volume: 5, percentage: null },
      "nonsense",
    ]);
    expect(rows.map((r) => r.percentage)).toEqual([1, 2]);
    expect(rows[0].fixed_fee).toBe(1.5);
    expect(rows[0].max_monthly_volume).toBeNull();
  });

  it("parses bands stored as a json string", () => {
    expect(normalizeVolumeTiers(JSON.stringify(TIERS))).toHaveLength(3);
    expect(normalizeVolumeTiers("{oops")).toEqual([]);
  });

  it("resolveVolumeTier returns null with no bands", () => {
    expect(resolveVolumeTier([], 100)).toBeNull();
  });

  it("summarises bands in contract-ready wording", () => {
    const text = summariseVolumeTiers(TIERS);
    expect(text).toContain("3.9%");
    expect(text).toContain("and above");
  });
});
