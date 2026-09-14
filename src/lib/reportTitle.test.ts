import { describe, expect, it } from "vitest";
import { defaultRunTitle, isGeneratedRunTitle } from "./reportTitle";

describe("report titles", () => {
  it("uses daily wording independently of cadence", () => {
    expect(defaultRunTitle("2026-09-14", "bimonthly", "daily_detailed"))
      .toBe("Daily Detailed Report – 14 Sept 2026");
    expect(defaultRunTitle("2026-09-14", "monthly", "daily_detailed"))
      .toBe("Daily Detailed Report – 14 Sept 2026");
  });

  it("recognises old generated daily titles without treating custom titles as generated", () => {
    expect(isGeneratedRunTitle("Bi-Monthly Revenue Review – 14 Sept 2026", "2026-09-14", "daily_detailed"))
      .toBe(true);
    expect(isGeneratedRunTitle("Daily Detailed Report – 14 Sept 2026", "2026-09-14", "daily_detailed"))
      .toBe(true);
    expect(isGeneratedRunTitle("Cheetah Plains team report", "2026-09-14", "daily_detailed"))
      .toBe(false);
  });
});