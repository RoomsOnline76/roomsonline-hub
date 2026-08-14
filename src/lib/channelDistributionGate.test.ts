import { describe, expect, it } from "vitest";
import {
  companySyncEligible,
  isDistributionBound,
  pushReportedOn,
  unboundDependentDetail,
} from "./channelDistributionGate";

describe("isDistributionBound", () => {
  it("is unbound when the owner or keys are missing", () => {
    expect(isDistributionBound({})).toBe(false);
    expect(isDistributionBound({ ruOwnerId: "99" })).toBe(false);
    expect(isDistributionBound({ keysCaptured: true })).toBe(false);
    expect(isDistributionBound({ ruOwnerId: "99", keysCaptured: true, pushGated: true })).toBe(false);
  });

  it("is bound only with an owner and captured keys", () => {
    expect(isDistributionBound({ ruOwnerId: "99", keysCaptured: true })).toBe(true);
  });
});

describe("unboundDependentDetail", () => {
  it("explains leftover publish IDs", () => {
    expect(unboundDependentDetail("publish", true)).toContain("leftover");
  });
});

describe("pushReportedOn", () => {
  const bound = { ruOwnerId: "99", keysCaptured: true, companyDetailsSent: true };

  it("is off when the property is unbound even if the flag is still true", () => {
    expect(pushReportedOn({ ruPushEnabled: true, ruOwnerId: null, keysCaptured: true })).toBe(false);
    expect(pushReportedOn({ ruPushEnabled: true, ruOwnerId: "99", keysCaptured: false })).toBe(false);
  });

  it("is on only when bound, company details sent, and the flag is on", () => {
    expect(pushReportedOn({ ...bound, ruPushEnabled: true })).toBe(true);
    expect(pushReportedOn({ ...bound, ruPushEnabled: false })).toBe(false);
    expect(pushReportedOn({ ...bound, ruPushEnabled: true, companyDetailsSent: false })).toBe(false);
  });
});

describe("companySyncEligible", () => {
  it("cannot be in sync while unbound or before company details were sent", () => {
    expect(
      companySyncEligible({
        ruOwnerId: null,
        keysCaptured: true,
        companyDetailsSent: true,
        companyFilledAt: "2026-01-01",
      }),
    ).toBe(false);
    expect(
      companySyncEligible({
        ruOwnerId: "99",
        keysCaptured: true,
        companyDetailsSent: false,
        companyFilledAt: "2026-01-01",
      }),
    ).toBe(false);
  });

  it("is eligible once identity gates passed, push is on, and a send was recorded", () => {
    expect(
      companySyncEligible({
        ruOwnerId: "99",
        keysCaptured: true,
        companyDetailsSent: true,
        ruPushEnabled: true,
        companyFilledAt: "2026-01-01",
      }),
    ).toBe(true);
    expect(
      companySyncEligible({
        ruOwnerId: "99",
        keysCaptured: true,
        companyDetailsSent: true,
        ruPushEnabled: false,
        companyFilledAt: "2026-01-01",
      }),
    ).toBe(false);
  });
});
