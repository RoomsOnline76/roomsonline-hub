import { describe, expect, it } from "vitest";

import { parseReportProfile, reportWindowOptions } from "../reportProfile";
import { windowMonths, monthsInWindow } from "../reportWindow";
import { resolveComparisons } from "../../../supabase/functions/_shared/reportComparisons";

/**
 * Cathedral Peak (OPERA) prints eight months opening on the month just closed
 * and targets last year's actuals plus 10%.
 */
const cathedralPeak = {
  source_mode: "pms_export",
  window_months: 8,
  window_start_offset: -1,
  target_growth_pct: 10,
};

describe("profile-driven report window", () => {
  it("keeps the standard six months opening on the review month by default", () => {
    const options = reportWindowOptions(parseReportProfile({}));
    expect(windowMonths("2026-08-20", "2026-08", options)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("prints Cathedral Peak's eight months from the month just closed", () => {
    const options = reportWindowOptions(parseReportProfile(cathedralPeak));
    expect(windowMonths("2026-08-20", "2026-08", options)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsInWindow(["2026-06", "2026-07", "2027-02", "2027-03"], "2026-08-20", "2026-08", options)).toEqual([
      "2026-07",
      "2027-02",
    ]);
  });

  it("rejects out-of-range window overrides", () => {
    const profile = parseReportProfile({ window_months: 99, window_start_offset: 12 });
    expect(profile.window_months).toBeNull();
    expect(profile.window_start_offset).toBe(0);
  });
});

describe("derived growth target", () => {
  const months = ["2026-07", "2026-08"];
  const lastYear = { revenue: { "2026-07": 1000, "2026-08": 2000 }, room_nights: { "2026-07": 10, "2026-08": 20 } };

  it("derives Target from last year plus the growth percentage", () => {
    const [target] = resolveComparisons(cathedralPeak, { months, lastYear });
    expect(target.key).toBe("target");
    expect(target.revenue["2026-07"]).toBeCloseTo(1100);
    expect(target.room_nights["2026-08"]).toBeCloseTo(22);
    expect(target.deltas?.map((d) => d.against)).toEqual(["otb", "last_year"]);
  });

  it("never overrides a target the client uploaded", () => {
    const [target] = resolveComparisons(
      { ...cathedralPeak, year_columns: ["target"] },
      {
        months,
        lastYear,
        importedBaseline: { targets: { revenue: { "2026-07": 5000, "2026-08": 6000 } } },
      },
    );
    expect(target.revenue["2026-07"]).toBe(5000);
    expect(target.deltas).toBeUndefined();
  });
});
