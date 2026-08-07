import { describe, expect, it } from "vitest";
import { filterLiveSeasons, isSeasonExpired, seasonWindows } from "./seasonLifecycle";

const TODAY = "2026-08-07";

describe("isSeasonExpired", () => {
  it("hides a season whose only window is in the past", () => {
    expect(isSeasonExpired({ periods: [{ from: "2025-01-01", to: "2025-03-31" }] }, TODAY)).toBe(true);
  });

  it("keeps a season that has a future window alongside old ones", () => {
    expect(
      isSeasonExpired(
        { periods: [{ from: "2025-01-01", to: "2025-03-31" }, { from: "2026-12-11", to: "2027-01-03" }] },
        TODAY,
      ),
    ).toBe(false);
  });

  it("keeps a season ending today", () => {
    expect(isSeasonExpired({ periods: [{ from: "2026-08-01", to: TODAY }] }, TODAY)).toBe(false);
  });

  it("reads the legacy flat from/to shape", () => {
    expect(isSeasonExpired({ from: "2024-06-01", to: "2024-06-30" }, TODAY)).toBe(true);
    expect(isSeasonExpired({ from: "2026-09-01", to: "2026-09-30" }, TODAY)).toBe(false);
  });

  it("never hides a season with no usable dates", () => {
    expect(isSeasonExpired({}, TODAY)).toBe(false);
    expect(isSeasonExpired({ periods: [{ from: "2025-01-01" }] }, TODAY)).toBe(false);
  });
});

describe("seasonWindows", () => {
  it("prefers periods and drops incomplete windows", () => {
    expect(seasonWindows({ periods: [{ from: "a", to: "b" }, { to: "c" }], from: "x", to: "y" })).toEqual([
      { from: "a", to: "b" },
    ]);
  });
});

describe("filterLiveSeasons", () => {
  it("returns only sellable seasons, preserving order", () => {
    const seasons = [
      { id: "past", periods: [{ from: "2025-02-01", to: "2025-02-10" }] },
      { id: "live", periods: [{ from: "2026-08-01", to: "2026-09-30" }] },
      { id: "future", periods: [{ from: "2027-01-01", to: "2027-01-10" }] },
    ];
    expect(filterLiveSeasons(seasons, TODAY).map((s) => s.id)).toEqual(["live", "future"]);
  });
});
