import { describe, it, expect } from "vitest";
import { stayQuotedTotal } from "./stayQuotedTotal";

describe("stayQuotedTotal", () => {
  it("keeps the nightly sum when there is no stay quote block", () => {
    expect(stayQuotedTotal(undefined, 3000)).toBe(3000);
    expect(stayQuotedTotal(null, 3000)).toBe(3000);
    expect(stayQuotedTotal({ shape: "nightly", stay_total: 9999 }, 3000)).toBe(3000);
  });

  it("keeps the nightly sum for los_nightly (series already adjusted)", () => {
    expect(stayQuotedTotal({ shape: "los_nightly", stay_total: 2700 }, 2700)).toBe(2700);
    expect(stayQuotedTotal({ shape: "los_nightly", stay_total: 1 }, 2700)).toBe(2700);
  });

  it("uses the stay total for full_stay", () => {
    expect(stayQuotedTotal({ shape: "full_stay", stay_total: 11200 }, 7000)).toBe(11200);
    expect(stayQuotedTotal({ shape: "full_stay", stay_total: 0 }, 7000)).toBe(7000);
  });
});
