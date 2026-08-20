import { describe, expect, it } from "vitest";
import { buildPropertySavePatch, mergePersistedRecord } from "@/lib/propertySavePatch";

describe("property save patches", () => {
  it("returns no changes for an unchanged submission", () => {
    const before = { name: "Camp", max_guests: 6, amenities: { facilities: ["pool"] } };
    expect(buildPropertySavePatch(before, before)).toEqual({});
  });

  it("updates only changed top-level columns", () => {
    const before = { name: "Camp", city: "Arusha", max_guests: 6 };
    expect(buildPropertySavePatch(before, { ...before, name: "Forest Camp" })).toEqual({ name: "Forest Camp" });
  });

  it("preserves nested values owned by other panels", () => {
    expect(mergePersistedRecord(
      { house_rules: { smoking: false, arrival_note: "Gate 2" }, integration_data: { id: 7 } },
      { house_rules: { smoking: true } },
    )).toEqual({
      house_rules: { smoking: true, arrival_note: "Gate 2" },
      integration_data: { id: 7 },
    });
  });

  it("preserves the stored capacity when the submitted snapshot does", () => {
    const before = { name: "Camp", max_guests: 8 };
    expect(buildPropertySavePatch(before, { name: "Camp", max_guests: 8 })).toEqual({});
  });
});