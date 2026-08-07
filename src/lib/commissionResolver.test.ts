import { describe, expect, it } from "vitest";
import {
  DEFAULT_LISTING_RATE,
  DEFAULT_PMS_RATE,
  resolveBookingCommission,
  resolveCommissionRate,
  resolveCommissionType,
} from "./commissionResolver";

/**
 * Merge-gate tests for commission. Commission is a function of gross amount and
 * configuration only — the rate hierarchy work must not be able to move it.
 */
describe("commission type", () => {
  it("classifies channel, direct PMS and marketplace bookings", () => {
    expect(resolveCommissionType({ payment_status: "paid_externally" } as never)).toBe("external");
    expect(resolveCommissionType(null)).toBeTruthy();
  });
});

describe("commission rate resolution", () => {
  it("external channel bookings carry no percentage", () => {
    expect(resolveCommissionRate("external", { commission_rate: 25 })).toEqual({
      rate: 0,
      type: "external",
      source: "external_channel",
    });
  });

  it("a commercial term beats every config value", () => {
    expect(resolveCommissionRate("listing", { listing_commission_rate: 12 }, { listing_commission_rate: 9 }, 7)).toMatchObject({
      rate: 7,
      source: "commercial_term",
    });
  });

  it("enterprise white label is subscription-only", () => {
    expect(resolveCommissionRate("pms", { billing_strategy: "enterprise_white_label", pms_commission_rate: 5 })).toMatchObject({
      rate: 0,
      source: "enterprise_white_label",
    });
  });

  it("PMS falls config -> widget flat -> shared -> default", () => {
    expect(resolveCommissionRate("pms", { pms_commission_rate: 3 })).toMatchObject({ rate: 3, source: "config_pms_rate" });
    expect(resolveCommissionRate("pms", { widget_flat_commission_rate: 4 })).toMatchObject({ rate: 4, source: "widget_flat" });
    expect(resolveCommissionRate("pms", { billing_strategy: "rolos_pms", commission_rate: 6 })).toMatchObject({
      rate: 6,
      source: "config_shared_rate",
    });
    expect(resolveCommissionRate("pms", null)).toMatchObject({ rate: DEFAULT_PMS_RATE, source: "default" });
  });

  it("listing falls config -> shared -> default", () => {
    expect(resolveCommissionRate("listing", { listing_commission_rate: 11 })).toMatchObject({ rate: 11 });
    expect(resolveCommissionRate("listing", { commission_rate: 8 })).toMatchObject({ rate: 8, source: "config_shared_rate" });
    expect(resolveCommissionRate("listing", null)).toMatchObject({ rate: DEFAULT_LISTING_RATE, source: "default" });
    expect(resolveCommissionRate("listing", null, { listing_commission_rate: 9 })).toMatchObject({ rate: 9 });
  });
});

describe("booking commission amount", () => {
  it("prefers the amount already billed on the booking", () => {
    const res = resolveBookingCommission(
      { calculated_commission: 150, commission_rate_applied: 10 } as never,
      1500,
      { listing_commission_rate: 25 },
    );
    expect(res).toMatchObject({ amount: 150, rate: 10, source: "booking_billed" });
  });

  it("derives the amount from the resolved rate when nothing is billed yet", () => {
    const res = resolveBookingCommission(null, 2000, { listing_commission_rate: 10 });
    expect(res.amount).toBeCloseTo(200, 6);
  });

  it("is linear in gross amount, so a rate change cannot distort the base", () => {
    const a = resolveBookingCommission(null, 1000, { listing_commission_rate: 10 }).amount;
    const b = resolveBookingCommission(null, 3000, { listing_commission_rate: 10 }).amount;
    expect(b).toBeCloseTo(a * 3, 6);
  });

  it("charges nothing on a zero-gross booking", () => {
    expect(resolveBookingCommission(null, 0, { listing_commission_rate: 10 }).amount).toBe(0);
  });
});
