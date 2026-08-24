import { describe, it, expect } from "vitest";
import {
  buildBillingEstimate,
  summariseEstimate,
  type EstimatorInput,
  type EstimatorPreset,
} from "./billingEstimate";
import type { GatewayBillingConfig } from "./gatewayBillingRate";

const preset: EstimatorPreset = {
  default_commission_rate: 12,
  default_transaction_fee: 3.5,
  channel_manager_per_unit_fee: 60,
  branding_addon_monthly_fee: 250,
  branding_addon_setup_fee: 1500,
  white_label_monthly_fee: 500,
  white_label_setup_fee: 2500,
  pricelabs_monthly_fee: 300,
  pricelabs_setup_fee: 400,
  tier_pricing_json: null,
};

function input(over: Partial<EstimatorInput> = {}): EstimatorInput {
  return {
    properties: [{ id: "a", name: "Prop A", units: 12 }],
    monthlyBookings: 20,
    monthlyBookingValue: 100000,
    addOns: {
      pms: true,
      channel_manager: true,
      branding: false,
      white_label: false,
      pricelabs: false,
      hubspot: true,
    },
    paymentMode: "rol",
    ...over,
  };
}

const hybrid: GatewayBillingConfig = {
  id: "gw1",
  name: "Standard Gateway Schedule",
  version: 1,
  is_active: true,
  model: "hybrid",
  base_percentage: 3.9,
  fixed_fee_per_txn: 2.5,
  monthly_platform_fee: 0,
  volume_tiers: [
    { min_monthly_volume: 0, max_monthly_volume: 100000, percentage: 3.9, fixed_fee: 2.5 },
    { min_monthly_volume: 100001, max_monthly_volume: null, percentage: 3.2, fixed_fee: 2 },
  ],
  currency: "ZAR",
};

describe("buildBillingEstimate", () => {
  it("keeps commission payable in both periods", () => {
    const e = buildBillingEstimate(preset, input(), hybrid);
    const line = e.lines.find((l) => l.key === "commission")!;
    expect(line.freePeriod).toBe(12000);
    expect(line.steadyState).toBe(12000);
    expect(line.waivedInFreePeriod).toBe(false);
  });

  it("waives subscriptions and add-ons in the free window only", () => {
    const e = buildBillingEstimate(preset, input(), hybrid);
    const pms = e.lines.find((l) => l.key === "pms")!;
    const cm = e.lines.find((l) => l.key === "channel_manager")!;
    expect(pms.freePeriod).toBe(0);
    expect(pms.steadyState).toBe(600); // 12 rooms → 10–19 band
    expect(cm.freePeriod).toBe(0);
    expect(cm.steadyState).toBe(720); // 60 x 12 units
    expect(e.freePeriodTotal).toBeLessThan(e.steadyStateTotal);
  });

  it("resolves the PMS tier from total room count across properties", () => {
    const e = buildBillingEstimate(
      preset,
      input({
        properties: [
          { id: "a", name: "A", units: 12 },
          { id: "b", name: "B", units: 15 },
        ],
      }),
      hybrid,
    );
    expect(e.totalUnits).toBe(27);
    expect(e.tier?.monthly_fee).toBe(750); // 20–50 band
  });

  it("bands card processing on estimated monthly value and charges the fixed fee per booking", () => {
    const low = buildBillingEstimate(preset, input({ monthlyBookingValue: 50000, monthlyBookings: 10 }), hybrid);
    expect(low.lines.find((l) => l.key === "processing")!.steadyState).toBeCloseTo(50000 * 0.039 + 2.5 * 10, 5);

    const high = buildBillingEstimate(preset, input({ monthlyBookingValue: 200000, monthlyBookings: 40 }), hybrid);
    expect(high.lines.find((l) => l.key === "processing")!.steadyState).toBeCloseTo(200000 * 0.032 + 2 * 40, 5);
  });

  it("falls back to the preset percentage when no schedule exists", () => {
    const e = buildBillingEstimate(preset, input(), null);
    expect(e.usedLegacyGatewayFallback).toBe(true);
    expect(e.lines.find((l) => l.key === "processing")!.steadyState).toBeCloseTo(3500, 5);
  });

  it("charges no processing for BYO or reservation-only", () => {
    expect(buildBillingEstimate(preset, input({ paymentMode: "byo" }), hybrid).lines.some((l) => l.key === "processing")).toBe(false);
    expect(
      buildBillingEstimate(preset, input({ paymentMode: "reservation_only" }), hybrid).lines.some((l) => l.key === "processing"),
    ).toBe(false);
  });

  it("keeps setup fees out of both monthly columns", () => {
    const e = buildBillingEstimate(
      preset,
      input({
        addOns: {
          pms: true,
          channel_manager: false,
          branding: true,
          white_label: true,
          pricelabs: true,
          hubspot: false,
        },
      }),
      hybrid,
    );
    expect(e.setupTotal).toBe(1500 + 2500 + 400);
    expect(e.lines.some((l) => l.label.toLowerCase().includes("setup"))).toBe(false);
  });

  it("never charges for the owner CRM", () => {
    const e = buildBillingEstimate(preset, input(), hybrid);
    const hs = e.lines.find((l) => l.key === "hubspot")!;
    expect(hs.freePeriod).toBe(0);
    expect(hs.steadyState).toBe(0);
  });

  it("splits totals across properties by unit share", () => {
    const e = buildBillingEstimate(
      preset,
      input({
        properties: [
          { id: "a", name: "A", units: 30 },
          { id: "b", name: "B", units: 10 },
        ],
      }),
      hybrid,
    );
    const [a, b] = e.perProperty;
    expect(a.steadyState / b.steadyState).toBeCloseTo(3, 5);
    expect(a.steadyState + b.steadyState).toBeCloseTo(e.steadyStateTotal, 5);
  });

  it("summarises both periods", () => {
    const s = summariseEstimate(buildBillingEstimate(preset, input(), hybrid));
    expect(s).toContain("First 60 days");
    expect(s).toContain("day 61");
  });
});
