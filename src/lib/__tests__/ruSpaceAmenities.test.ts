import { describe, expect, it } from "vitest";

import { filterSpaceAmenities } from "@/lib/ruSpaceAmenities";
import type { RuAmenity } from "@/lib/ruAmenities";

const a = (id: number, name: string, category: string): RuAmenity =>
  ({ id, name, category, is_recommended: false });

const list = [
  a(101, "Kitchen", "Kitchen & Dining"),
  a(11, "Washing machine", "Laundry & Cleaning"),
  a(227, "Swimming pool", "Pool, Spa & Leisure"),
  a(257, "Bedroom", "Bedroom & Beds"),
  a(81, "Bathroom", "Bathroom"),
];

describe("space-scoped amenity slices", () => {
  it("keeps only kitchen-plausible items", () => {
    expect(filterSpaceAmenities(list, "kitchen").map((x) => x.id)).toEqual([101, 11]);
  });

  it("keeps only sleeping-space items for a bedroom", () => {
    expect(filterSpaceAmenities(list, "bedroom").map((x) => x.id)).toEqual([257, 81]);
  });

  it("never hides an already-selected amenity", () => {
    expect(filterSpaceAmenities(list, "kitchen", [227]).map((x) => x.id)).toEqual([101, 11, 227]);
  });
});
