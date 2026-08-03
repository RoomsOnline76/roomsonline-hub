import { describe, expect, it } from "vitest";
import { mergePortfolioSeasonDates } from "./portfolioSeasonSync";

describe("mergePortfolioSeasonDates", () => {
  it("copies dates but preserves the target season ID used by its rates", () => {
    const result = mergePortfolioSeasonDates(
      [{ id: "source-peak", name: "Peak", from: "2026-12-01", to: "2027-01-15", periods: [{ from: "2026-12-01", to: "2027-01-15" }] }],
      [{ id: "target-peak", name: "Peak", from: "2025-12-01", to: "2026-01-10" }],
    );
    expect(result[0]).toMatchObject({ id: "target-peak", from: "2026-12-01", to: "2027-01-15" });
  });
});