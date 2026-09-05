import { describe, expect, it } from "vitest";

import { bedRoomAmenities, flattenBedGroups, groupBedsByRoom, type BedEntry } from "@/lib/bedConfig";

describe("per-bedroom amenities", () => {
  it("survives the group → flatten → group round trip", () => {
    const groups = groupBedsByRoom([
      { type: "queen", count: 1, room: { kind: "bedroom", index: 1 } },
      { type: "twin", count: 2, room: { kind: "bedroom", index: 2 } },
    ] as BedEntry[]);

    const withAmenities = groups.map((g, i) =>
      i === 1 ? { ...g, slot: { ...g.slot, amenities: ["ru:81", "ru:167"] } } : g,
    );

    const stored = flattenBedGroups(withAmenities);
    const reread = groupBedsByRoom(stored);

    expect(bedRoomAmenities(reread[0])).toEqual([]);
    expect(bedRoomAmenities(reread[1])).toEqual(["ru:81", "ru:167"]);
  });

  it("keeps a space's amenities when only one of its beds carries them", () => {
    const stored: BedEntry[] = [
      { type: "single", count: 1, room: { kind: "bedroom", index: 1, amenities: ["ru:190"] } },
      { type: "single", count: 1, room: { kind: "bedroom", index: 1 } },
    ];
    expect(bedRoomAmenities(groupBedsByRoom(stored)[0])).toEqual(["ru:190"]);
  });

  it("ignores blank or duplicate tokens", () => {
    const stored: BedEntry[] = [
      { type: "king", count: 1, room: { kind: "bedroom", index: 1, amenities: ["ru:81", " ", "ru:81"] } },
    ];
    expect(bedRoomAmenities(groupBedsByRoom(stored)[0])).toEqual(["ru:81"]);
  });
});
