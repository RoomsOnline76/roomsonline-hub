import { describe, expect, it } from "vitest";
import { deriveChangedChannelFields, sectionsOf } from "@/lib/channelPushFields";

describe("channel push field classification", () => {
  it("sends a property-name-only edit to content", () => {
    const changes = deriveChangedChannelFields({ name: "Old" }, { name: "New" });
    expect(changes).toEqual([{ path: "name", label: "property name", section: "content" }]);
  });

  it("classifies facilities as content and charges as rates", () => {
    const before = { amenities: { facilities: ["pool"], charges: [] } };
    const after = { amenities: { facilities: ["pool", "wifi"], charges: [{ name: "cleaning" }] } };
    const changes = deriveChangedChannelFields(before, after);
    expect(sectionsOf(changes)).toEqual(["content", "rates"]);
    expect(changes.map((change) => change.label)).toEqual(["amenities", "charges"]);
  });

  it("does not report unchanged mandatory fields", () => {
    const snapshot = { name: "Camp", images: ["one.jpg"], amenities: { facilities: ["pool"] } };
    expect(deriveChangedChannelFields(snapshot, snapshot)).toEqual([]);
  });
});