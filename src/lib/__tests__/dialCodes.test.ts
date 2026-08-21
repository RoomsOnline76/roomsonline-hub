import { describe, expect, it } from "vitest";
import { ensureE164, joinPhone, splitPhone } from "@/lib/dialCodes";

describe("phone capture keeps a full international number", () => {
  it("joins a dial code with a local number", () => {
    expect(joinPhone("+27", "82 123 4567")).toBe("+27821234567");
  });

  it("drops the trunk zero", () => {
    expect(joinPhone("+27", "082 123 4567")).toBe("+27821234567");
  });

  it("keeps a pasted international number", () => {
    expect(joinPhone("+27", "+44 20 7123 4567")).toBe("+442071234567");
  });

  it("splits a stored number back into parts", () => {
    expect(splitPhone("+27821234567")).toEqual({ iso: "ZA", dial: "+27", local: "821234567" });
  });

  it("adds the picker country to a legacy local-only number", () => {
    expect(ensureE164("082 123 4567", "ZA")).toBe("+27821234567");
  });

  it("leaves an already-prefixed number untouched", () => {
    expect(ensureE164("+442071234567", "ZA")).toBe("+442071234567");
  });

  it("stays empty when there is no number", () => {
    expect(ensureE164("", "ZA")).toBe("");
  });
});
