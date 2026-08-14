import { describe, expect, it } from "vitest";
import {
  channelQueueProgress,
  ruMandatoryCheckSummary,
  websiteQueueProgress,
  WEBSITE_LIST_MINIMUM,
} from "./onboardingQueueProgress";

describe("websiteQueueProgress", () => {
  it("does not mix ROL Spec into the listing score", () => {
    const p = websiteQueueProgress(80, 80, false);
    expect(p.percent).toBe(80);
    expect(p.meetsMinimum).toBe(true);
    expect(p.label).toContain("can list");
  });

  it("explains a score below the 70% list minimum", () => {
    const p = websiteQueueProgress(65, 60, false);
    expect(p.percent).toBe(65);
    expect(p.meetsMinimum).toBe(false);
    expect(p.label).toBe(`65% · ${WEBSITE_LIST_MINIMUM - 65} pts short`);
    expect(p.hint.toLowerCase()).toContain("70%");
  });

  it("says On website when listed", () => {
    expect(websiteQueueProgress(65, 65, true).label).toBe("On website");
  });
});

describe("channelQueueProgress", () => {
  it("is 92% when RU is published, tests pass, and no channel is connected", () => {
    const p = channelQueueProgress({
      isRolos: true,
      channelsConnected: 0,
      propertyListingId: "12345",
      activeUnits: 2,
      publishedUnits: 2,
      ruMandatoryPass: true,
      ruMandatoryPercent: 100,
    });
    expect(p.percent).toBe(92);
    expect(p.stage).toBe("connect");
    expect(p.label).toBe("Ready to be connected to Channel");
  });

  it("treats unit-level listing ids as published when the property id is empty", () => {
    const p = channelQueueProgress({
      isRolos: true,
      channelsConnected: 0,
      propertyListingId: null,
      activeUnits: 3,
      publishedUnits: 3,
      ruMandatoryPass: true,
    });
    expect(p.percent).toBe(92);
    expect(p.stage).toBe("connect");
    expect(p.label).toBe("Ready to be connected to Channel");
  });

  it("does not say Ready when listing ids exist but RU tests fail", () => {
    const p = channelQueueProgress({
      isRolos: true,
      channelsConnected: 0,
      propertyListingId: "12345",
      activeUnits: 2,
      publishedUnits: 2,
      ruMandatoryPass: false,
      ruMandatoryPercent: 60,
    });
    expect(p.stage).toBe("publish");
    expect(p.percent).toBe(60);
    expect(p.label).toContain("RU checks failing");
  });

  it("does not say Ready when listing ids exist but RU tests are unconfirmed", () => {
    const p = channelQueueProgress({
      isRolos: true,
      channelsConnected: 0,
      propertyListingId: "12345",
      activeUnits: 1,
      publishedUnits: 1,
    });
    expect(p.stage).toBe("publish");
    expect(p.label).toBe("Confirm RU checks");
  });

  it("completes at 100% when one channel is connected", () => {
    const p = channelQueueProgress({
      isRolos: true,
      channelsConnected: 1,
      propertyListingId: "12345",
      activeUnits: 1,
      publishedUnits: 1,
    });
    expect(p.percent).toBe(100);
    expect(p.stage).toBe("live");
  });
});

describe("ruMandatoryCheckSummary", () => {
  it("fails when blocking gaps are present", () => {
    const s = ruMandatoryCheckSummary({
      blocked: true,
      blocking_gaps: ["Photos: main image missing"],
      mandatory_total: 10,
      mandatory_passed: 6,
    });
    expect(s.known).toBe(true);
    expect(s.pass).toBe(false);
    expect(s.percent).toBe(60);
  });

  it("passes when no mandatory failures remain", () => {
    const s = ruMandatoryCheckSummary({
      blocked: false,
      blocking_gaps: [],
      mandatory_total: 10,
      mandatory_passed: 10,
    });
    expect(s.pass).toBe(true);
    expect(s.percent).toBe(100);
  });
});
