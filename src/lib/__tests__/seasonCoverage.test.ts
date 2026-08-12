import { describe, expect, it } from "vitest";
import { computeSeasonCoverage } from "@/lib/seasonCoverage";

const TODAY = new Date("2026-03-01T09:00:00Z");

describe("computeSeasonCoverage", () => {
  it("reports a fully covered rolling year with no gaps", () => {
    const coverage = computeSeasonCoverage(
      [
        { from: "2026-01-01", to: "2026-06-30" },
        { from: "2026-07-01", to: "2027-12-31" },
      ],
      TODAY,
    );
    expect(coverage.fullyCovered).toBe(true);
    expect(coverage.gaps).toHaveLength(0);
    expect(coverage.coveredDays).toBe(365);
    expect(coverage.windowStart).toBe("2026-03-01");
    expect(coverage.windowEnd).toBe("2027-02-28");
  });

  it("names the uncovered stretches inside the window", () => {
    const coverage = computeSeasonCoverage(
      [{ from: "2026-03-01", to: "2026-03-10" }],
      TODAY,
    );
    expect(coverage.fullyCovered).toBe(false);
    expect(coverage.coveredDays).toBe(10);
    expect(coverage.gaps).toEqual([{ from: "2026-03-11", to: "2027-02-28" }]);
  });

  it("merges overlapping and adjacent periods and ignores invalid ones", () => {
    const coverage = computeSeasonCoverage(
      [
        { from: "2026-03-01", to: "2026-03-15" },
        { from: "2026-03-10", to: "2026-03-20" },
        { from: "2026-03-21", to: "2026-03-31" },
        { from: "2026-05-10", to: "2026-05-01" },
        { from: "", to: "" },
      ],
      TODAY,
    );
    expect(coverage.coveredDays).toBe(31);
    expect(coverage.gaps[0]).toEqual({ from: "2026-04-01", to: "2027-02-28" });
    expect(coverage.earliest).toBe("2026-03-01");
    expect(coverage.latest).toBe("2026-03-31");
  });
});
