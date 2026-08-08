import { describe, expect, it } from "vitest";
import {
  addMonths,
  costContributionEur,
  forecastForMonth,
  forecastSchedule,
  listingsToNextTier,
  periodMinimumFor,
  tierFor,
} from "@/lib/channelBillingForecast";

describe("tierFor", () => {
  it("returns null below the first tier floor", () => {
    expect(tierFor(0)).toBeNull();
    expect(tierFor(100)).toBeNull();
  });

  it("maps each band to its fixed per-listing rate", () => {
    expect(tierFor(101)?.rateEur).toBe(3.5);
    expect(tierFor(500)?.rateEur).toBe(3.5);
    expect(tierFor(501)?.rateEur).toBe(3);
    expect(tierFor(1000)?.rateEur).toBe(3);
    expect(tierFor(1001)?.rateEur).toBe(2.5);
    expect(tierFor(25000)?.rateEur).toBe(2.5);
  });
});

describe("periodMinimumFor", () => {
  it("treats the opening months as grace", () => {
    expect(periodMinimumFor("2026-09").minimumEur).toBe(0);
    expect(periodMinimumFor("2026-10").minimumEur).toBe(0);
  });

  it("applies the 250 and 500 steps", () => {
    expect(periodMinimumFor("2026-11").minimumEur).toBe(250);
    expect(periodMinimumFor("2026-12").minimumEur).toBe(250);
    expect(periodMinimumFor("2027-01").minimumEur).toBe(500);
    expect(periodMinimumFor("2027-06").minimumEur).toBe(500);
  });

  it("treats months before the ramp as grace", () => {
    expect(periodMinimumFor("2026-08").minimumEur).toBe(0);
  });
});

describe("forecastForMonth", () => {
  it("bills nothing during grace with a small footprint", () => {
    const f = forecastForMonth(4, "2026-09");
    expect(f.billableEur).toBe(0);
    expect(f.driver).toBe("grace");
  });

  it("bills the minimum when usage is lower", () => {
    const f = forecastForMonth(4, "2026-11");
    expect(f.usageEur).toBe(0);
    expect(f.billableEur).toBe(250);
    expect(f.driver).toBe("minimum");
  });

  it("bills usage when it exceeds the minimum", () => {
    const f = forecastForMonth(200, "2026-11");
    expect(f.usageEur).toBe(700);
    expect(f.billableEur).toBe(700);
    expect(f.driver).toBe("usage");
  });

  it("uses the cheaper rate once volume steps up", () => {
    expect(forecastForMonth(600, "2027-01").usageEur).toBe(1800);
    expect(forecastForMonth(1200, "2027-01").usageEur).toBe(3000);
  });

  it("still charges the 500 minimum in 2027 for a tiny account", () => {
    expect(forecastForMonth(10, "2027-01").billableEur).toBe(500);
  });
});

describe("listingsToNextTier", () => {
  it("counts the gap to the next band", () => {
    expect(listingsToNextTier(4)?.needed).toBe(97);
    expect(listingsToNextTier(450)?.needed).toBe(51);
    expect(listingsToNextTier(1500)).toBeNull();
  });
});

describe("costContributionEur", () => {
  it("prices a property at the account-wide tier", () => {
    expect(costContributionEur(10, 600)).toBe(30);
    expect(costContributionEur(10, 50)).toBe(0);
  });
});

describe("schedule helpers", () => {
  it("rolls month keys across a year boundary", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
  });

  it("starts at the ramp and holds the listing count flat", () => {
    const rows = forecastSchedule(4, new Date("2026-08-08T00:00:00Z"), 6);
    expect(rows[0].month).toBe("2026-08");
    expect(rows.every((r) => r.listings === 4)).toBe(true);
    expect(rows.at(-1)?.month).toBe("2027-01");
  });
});
