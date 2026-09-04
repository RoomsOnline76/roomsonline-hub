import { describe, it, expect } from "vitest";
import { journeyRequoteMismatch, journeyRequoteMessage } from "../journeyRequote";

const stay = (over: Partial<Parameters<typeof journeyRequoteMismatch>[0][number]> = {}) => ({
  stayId: "s1",
  propertyName: "Sealion Lodge",
  shownNet: 3000,
  serverNet: 3000,
  ...over,
});

describe("journeyRequoteMismatch", () => {
  it("passes a journey whose stays still price the same", () => {
    expect(journeyRequoteMismatch([stay(), stay({ stayId: "s2" })])).toBeNull();
  });

  it("tolerates rounding of a rand or less", () => {
    expect(journeyRequoteMismatch([stay({ serverNet: 3000.5 })])).toBeNull();
  });

  it("catches a stay that has gone up", () => {
    const bad = journeyRequoteMismatch([stay(), stay({ stayId: "s2", serverNet: 3400 })]);
    expect(bad?.stayId).toBe("s2");
  });

  it("catches a stay that has gone down", () => {
    expect(journeyRequoteMismatch([stay({ serverNet: 2500 })])?.stayId).toBe("s1");
  });

  it("skips stays the engine could not quote", () => {
    expect(journeyRequoteMismatch([stay({ serverNet: null }), stay({ stayId: "s2", serverNet: 0 })])).toBeNull();
  });

  it("names the property in the refusal", () => {
    expect(journeyRequoteMessage(stay())).toContain("Sealion Lodge");
  });
});
