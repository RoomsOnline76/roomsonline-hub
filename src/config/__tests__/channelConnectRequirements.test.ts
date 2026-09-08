import { describe, expect, it } from "vitest";

import { gradeConnectEligibility } from "@/config/channelConnectRequirements";
import { resolveMcqRequirement } from "@/lib/mcqRequirements";
import type { RequirementSubject } from "@/config/propertyFieldRequirements";

const unit = (over: Record<string, unknown> = {}) => ({
  name: "Garden Suite",
  description: "x".repeat(700),
  floor: 1,
  roomSize: 40,
  bathrooms: 1,
  toilets: 1,
  maxPeople: 4,
  bedrooms: 2,
  bedConfiguration: [
    { type: "double", count: 1 },
    { type: "single", count: 2 },
  ],
  property_type: "apartment",
  minStay: 2,
  maxStay: 0,
  ...over,
});

const subject = (over: Partial<RequirementSubject> = {}): RequirementSubject => ({
  name: "Albatros Beach House",
  property_type: "apartment",
  description: "y".repeat(700),
  address: "12 Marine Drive",
  city: "Cape Town",
  country: "ZA",
  latitude: -33.9,
  longitude: 18.4,
  rentalsunited_property_id: "5829846",
  amenities: { room_types: [unit()] },
  ...over,
});

describe("sales-channel connect grading", () => {
  it("names the exact shortfall for a listing name outside 8–50 characters", () => {
    const grade = gradeConnectEligibility("airbnb", subject({ name: "Sea" }));
    const miss = grade.failing.find((f) => f.key === "name_length_8_50");
    expect(miss).toBeDefined();
    expect(miss?.shortfall).toContain("3 characters");
    expect(miss?.focusKey).toBe("channel_listing_name");
  });

  it("accepts a short channel listing name instead of renaming the property", () => {
    const long = "A".repeat(80);
    const ok = gradeConnectEligibility(
      "airbnb",
      subject({ name: long, amenities: { room_types: [unit()], channel_listing_name: "Beach House" } }),
    );
    expect(ok.failing.some((f) => f.key === "name_length_8_50")).toBe(false);
  });

  it("does not apply the name-length overlay to Booking.com", () => {
    const grade = gradeConnectEligibility("booking", subject({ name: "A".repeat(80) }));
    expect(grade.failing.some((f) => f.key === "name_length_8_50")).toBe(false);
  });

  it("measures beds against maximum guests per unit and names the unit", () => {
    const grade = gradeConnectEligibility(
      "airbnb",
      subject({ amenities: { room_types: [unit({ maxPeople: 6 })] } }),
    );
    const miss = grade.failing.find((f) => f.key === "room_beds_match_max");
    expect(miss?.shortfall).toContain("beds sleep 4");
    expect(miss?.shortfall).toContain("max guests is 6");
    expect(miss?.unit).toBe("Garden Suite");
  });

  it("keeps staff-only rows away from owners", () => {
    const s = subject({ country: "FR" });
    const owner = gradeConnectEligibility("airbnb", s);
    const staff = gradeConnectEligibility("airbnb", s, { includeStaff: true });
    expect(owner.failing.some((f) => f.key === "licence_info")).toBe(false);
    expect(staff.failing.some((f) => f.key === "licence_info")).toBe(true);
  });

  it("flags an unpublished listing", () => {
    const grade = gradeConnectEligibility("all", subject({ rentalsunited_property_id: null }));
    expect(grade.failing.some((f) => f.key === "listing_published")).toBe(true);
    expect(grade.passed).toBe(false);
  });

  it("never blames a field for a bare refusal", () => {
    const resolved = resolveMcqRequirement(
      "Our quick check shows that you are not eligible to connect to Airbnb",
    );
    expect(resolved?.focusKey).toBeUndefined();
    expect(resolved?.title).not.toMatch(/description/i);
  });
});
