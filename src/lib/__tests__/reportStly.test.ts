import { describe, expect, it } from "vitest";

import {
  formatAsOf,
  isLastYearVintage,
  resolveStlySeries,
  shiftMapForward,
} from "../../../supabase/functions/_shared/reportStly";

const months = ["2026-08", "2026-09", "2026-10"];

describe("reportStly", () => {
  it("shifts month keys forward a year and drops odd keys", () => {
    expect(shiftMapForward({ "2025-08": 10, total: 99 })).toEqual({ "2026-08": 10 });
  });

  it("recognises a vintage roughly one year old", () => {
    expect(isLastYearVintage("2026-08-14", "2025-08-14")).toBe(true);
    expect(isLastYearVintage("2026-08-14", "2025-06-01")).toBe(false);
    expect(isLastYearVintage("2026-08-14", "2026-08-01")).toBe(false);
  });

  it("prefers the ledger STLY block when the parser produced one", () => {
    const series = resolveStlySeries({
      months,
      asOfDate: "2026-08-14",
      snapshotStly: { revenue: { "2026-08": 100 }, room_nights: { "2026-08": 4 } },
    });
    expect(series.source).toBe("ledger");
    expect(series.revenue["2026-08"]).toBe(100);
  });

  it("reads last year's sent pack own on-the-books column as this year's STLY", () => {
    const series = resolveStlySeries({
      months,
      asOfDate: "2026-08-14",
      importedBaseline: {
        as_of_date: "2025-08-12",
        current_otb_revenue: { "2025-08": 250, "2025-09": 400 },
        current_room_nights: { "2025-08": 6 },
      },
    });
    expect(series.source).toBe("prior_workbook");
    expect(series.asOfDate).toBe("2025-08-12");
    expect(series.revenue).toEqual({ "2026-08": 250, "2026-09": 400 });
    expect(series.room_nights).toEqual({ "2026-08": 6 });
  });

  it("ignores a same-vintage pack and falls back to one of our own runs", () => {
    const series = resolveStlySeries({
      months,
      asOfDate: "2026-08-14",
      importedBaseline: { as_of_date: "2026-06-30", current_otb_revenue: { "2026-08": 1 } },
      storedRuns: [
        { id: "run-a", as_of_date: "2024-08-10", otb_revenue: { "2024-08": 5 } },
        { id: "run-b", as_of_date: "2025-08-15", otb_revenue: { "2025-08": 300 } },
      ],
    });
    expect(series.source).toBe("stored_run");
    expect(series.runId).toBe("run-b");
    expect(series.revenue).toEqual({ "2026-08": 300 });
  });

  it("returns nothing when no source can supply the column", () => {
    expect(resolveStlySeries({ months, asOfDate: "2026-08-14" }).source).toBe("none");
  });

  it("formats the as-of date for the column heading", () => {
    expect(formatAsOf("2025-08-14")).toBe("14 Aug 2025");
    expect(formatAsOf(null)).toBeNull();
  });
});
