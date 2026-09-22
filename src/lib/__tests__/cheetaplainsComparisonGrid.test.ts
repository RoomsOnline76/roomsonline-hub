import { describe, expect, it } from "vitest";

import {
  buildYearGrids,
  type ComparisonMonthRow,
} from "../../../supabase/functions/_shared/cheetaplains/comparisonGrid";

const month = (
  value: string,
  bob: number | null,
  stly: number | null,
): ComparisonMonthRow => ({
  month: `${value}-01`,
  bob,
  occupancy: 0.5,
  budget: 100,
  stly,
  stly_occupancy: 0.4,
  last_year: 80,
  last_year_occupancy: 0.3,
});

describe("Cheetah Plains daily comparison grid", () => {
  it("calculates positive, negative and zero pickup and STLY variance", () => {
    const rows = [
      month("2026-03", 120, 100),
      month("2026-04", 80, 100),
      month("2026-05", 100, 100),
    ];
    const grid = buildYearGrids(rows, {
      current: {
        "2026-03": { bob: 120, occupancy: 0.6 },
        "2026-04": { bob: 80, occupancy: 0.4 },
        "2026-05": { bob: 100, occupancy: 0.5 },
      },
      previous: {
        "2026-03": { bob: 100, occupancy: 0.5 },
        "2026-04": { bob: 100, occupancy: 0.5 },
        "2026-05": { bob: 100, occupancy: 0.5 },
      },
    })[0];
    expect(grid?.rows.slice(0, 3).map((row) => row.pickup)).toEqual([20, -20, 0]);
    expect(grid?.rows.slice(0, 3).map((row) => row.varianceToStly)).toEqual([20, -20, 0]);
  });

  it("prints missing prior snapshots as null and totals comparison columns", () => {
    const grid = buildYearGrids([
      month("2026-03", 120, 100),
      month("2026-04", 80, 100),
    ])[0];
    expect(grid?.rows[0]?.previousBob).toBeNull();
    expect(grid?.rows[0]?.pickup).toBeNull();
    expect(grid?.rows[3]?.varianceToStly).toBe(0);
    expect(grid?.rows.at(-1)?.bob).toBe(200);
    expect(grid?.rows.at(-1)?.varianceToStly).toBe(0);
  });
});