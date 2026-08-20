import { describe, expect, it } from "vitest";
import {
  MANDATORY_CHECK_PATHS,
  TRACKED_PATHS,
  deriveChangedChannelFields,
  sectionsOf,
} from "@/lib/channelPushFields";

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

describe("mandatory wizard requirement coverage", () => {
  it("tracks a payload path for every mandatory readiness check", () => {
    const untracked = Object.entries(MANDATORY_CHECK_PATHS).filter(
      ([, paths]) => paths.length === 0 || !paths.every((path) => TRACKED_PATHS.includes(path)),
    );
    expect(untracked).toEqual([]);
  });
});

describe("newly mandatory field edits", () => {
  const cases: { label: string; before: Record<string, unknown>; after: Record<string, unknown> }[] = [
    { label: "toilets", before: { toilets: 1 }, after: { toilets: 2 } },
    { label: "kitchen", before: { separate_kitchen: false }, after: { separate_kitchen: true } },
    {
      label: "floor",
      before: { amenities: { property_floor: 0 } },
      after: { amenities: { property_floor: 2 } },
    },
    {
      label: "property size",
      before: { amenities: { property_size_sqm: 50 } },
      after: { amenities: { property_size_sqm: 120 } },
    },
    {
      label: "payment methods",
      before: { amenities: { payment_methods: ["cash"] } },
      after: { amenities: { payment_methods: ["cash", "card"] } },
    },
    {
      label: "cancellation policy",
      before: { amenities: { cancellation_policies: [] } },
      after: { amenities: { cancellation_policies: [{ days: 14, penalty: 50 }] } },
    },
    {
      label: "changeover rule",
      before: { amenities: { changeover: 0 } },
      after: { amenities: { changeover: 2 } },
    },
    {
      label: "changeover rule",
      before: { amenities: { changeover_rules: {} } },
      after: { amenities: { changeover_rules: { sat: 1 } } },
    },
  ];

  for (const { label, before, after } of cases) {
    it(`reports "${label}" when only that field changes`, () => {
      const changes = deriveChangedChannelFields(before, after);
      expect(changes.map((change) => change.label)).toEqual([label]);
    });
  }
});

describe("unit photo changes", () => {
  const base = {
    amenities: {
      room_types: [
        { id: "u1", name: "Elf", images: ["a.jpg"] },
        { id: "u2", name: "Leervis", images: ["b.jpg"] },
      ],
    },
  };

  it("reports a photo added to a unit", () => {
    const after = {
      amenities: {
        room_types: [
          { id: "u1", name: "Elf", images: ["a.jpg", "new.jpg"] },
          { id: "u2", name: "Leervis", images: ["b.jpg"] },
        ],
      },
    };
    const labels = deriveChangedChannelFields(base, after).map((f) => f.label);
    expect(labels).toContain("unit photos");
  });

  it("reports a photo removed from a unit", () => {
    const after = {
      amenities: { room_types: [{ id: "u1", name: "Elf", images: [] }, { id: "u2", name: "Leervis", images: ["b.jpg"] }] },
    };
    expect(deriveChangedChannelFields(base, after).map((f) => f.label)).toContain("unit photos");
  });

  it("stays silent when unit photos are untouched", () => {
    expect(deriveChangedChannelFields(base, JSON.parse(JSON.stringify(base))).map((f) => f.label)).not.toContain(
      "unit photos",
    );
  });

  it("reports property photos and the main photo", () => {
    const labels = deriveChangedChannelFields(
      { images: ["a.jpg"], main_image: "a.jpg" },
      { images: ["a.jpg", "b.jpg"], main_image: "b.jpg" },
    ).map((f) => f.label);
    expect(labels).toContain("property photos");
    expect(labels).toContain("main photo");
  });
});
