import { describe, expect, it } from "vitest";
import { canonicalPricingModel, pricingNoun } from "../ratePlanDraft";

/**
 * Mirrors supabase/functions/_shared/ratePricing.ts — the same normalisation runs
 * on the server, so legacy values must map identically on both sides.
 */
type Model = "per_room" | "per_person" | "per_person_sharing" | "per_unit";

function stayTotalForModel(
  raw: string,
  opts: {
    nightlyRates: number[];
    adults: number;
    teens?: number;
    children?: number;
    extraAdultRate?: number;
    childRate?: number;
    teenRate?: number;
    units?: number;
  },
): number {
  const model: Model = canonicalPricingModel(raw);
  const adults = Math.max(0, opts.adults);
  const teens = Math.max(0, opts.teens ?? 0);
  const children = Math.max(0, opts.children ?? 0);
  const units = Math.max(1, opts.units ?? 1);
  let total = 0;
  for (const rate of opts.nightlyRates) {
    const nightly = Number(rate) || 0;
    if (model === "per_room" || model === "per_unit") {
      total += nightly * units;
    } else if (model === "per_person") {
      total += nightly * adults + teens * (opts.teenRate ?? nightly) + children * (opts.childRate ?? nightly);
    } else {
      const extraRate = opts.extraAdultRate ?? nightly / 2;
      total += nightly + Math.max(0, adults - 2) * extraRate
        + teens * (opts.teenRate ?? extraRate)
        + children * (opts.childRate ?? extraRate);
    }
  }
  return total;
}

describe("canonicalPricingModel", () => {
  it("maps legacy spellings onto the four canonical models", () => {
    expect(canonicalPricingModel("UnitRate")).toBe("per_unit");
    expect(canonicalPricingModel("per-unit")).toBe("per_unit");
    expect(canonicalPricingModel("unit rate")).toBe("per_unit");
    expect(canonicalPricingModel("PER PERSON")).toBe("per_person");
    expect(canonicalPricingModel("per-person")).toBe("per_person");
    expect(canonicalPricingModel("pps")).toBe("per_person_sharing");
    expect(canonicalPricingModel("Per Person Sharing")).toBe("per_person_sharing");
    expect(canonicalPricingModel("PER_ROOM")).toBe("per_room");
    expect(canonicalPricingModel("per_night")).toBe("per_room");
  });

  it("falls back to per_room for empty or unknown values", () => {
    expect(canonicalPricingModel(null)).toBe("per_room");
    expect(canonicalPricingModel("")).toBe("per_room");
    expect(canonicalPricingModel("something-odd")).toBe("per_room");
  });

  it("gives dynamic nouns for legacy values too", () => {
    expect(pricingNoun("PER PERSON").singular).toBe("person");
    expect(pricingNoun("UnitRate").singular).toBe("unit");
    expect(pricingNoun("pps").perNight).toBe("per person sharing / night");
  });
});

describe("stay totals across a 3-night, 3-adult, 1-child stay", () => {
  const nightlyRates = [1000, 1000, 1200];

  it("per room ignores occupancy", () => {
    expect(stayTotalForModel("per_room", { nightlyRates, adults: 3, children: 1 })).toBe(3200);
  });

  it("per unit multiplies by units", () => {
    expect(stayTotalForModel("UnitRate", { nightlyRates, adults: 3, units: 2 })).toBe(6400);
  });

  it("per person multiplies by guests", () => {
    expect(
      stayTotalForModel("PER PERSON", { nightlyRates, adults: 3, children: 1, childRate: 250 }),
    ).toBe(3200 * 3 + 250 * 3);
  });

  it("per person sharing charges the base for 2 and extras beyond", () => {
    expect(
      stayTotalForModel("per_person_sharing", {
        nightlyRates,
        adults: 3,
        children: 1,
        extraAdultRate: 400,
        childRate: 250,
      }),
    ).toBe(3200 + 400 * 3 + 250 * 3);
  });

  it("per person sharing defaults extras to half the nightly rate", () => {
    expect(stayTotalForModel("pps", { nightlyRates: [1000], adults: 4 })).toBe(1000 + 500 * 2);
  });
});
