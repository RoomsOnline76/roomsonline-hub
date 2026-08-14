import { describe, expect, it } from "vitest";
import { calculateWebsiteWizardScore, scoreWebsiteListing } from "./websiteWizardScore";

const baseProperty = {
  name: "Seesig",
  property_type: "Villa",
  property_url: "https://example.com/seesig",
  address: "1 Beach Rd",
  city: "Cape Town",
  country: "South Africa",
  latitude: -34.1,
  longitude: 18.4,
  description: "A long enough property description for the listing wizard.",
  short_description: "Sea views",
  images: [
    { url: "https://img/1.jpg", type: "hero" },
    { url: "https://img/2.jpg", type: "gallery" },
    { url: "https://img/3.jpg", type: "gallery" },
  ],
  amenities: {
    offerings: { accommodation: true },
    contact: { telephone: "+27 21 000 0000", email: "stay@seesig.co.za" },
    house_rules: { check_in_from: "15:00", check_out_to: "10:00", check_in_instructions: "Keys at reception" },
    banking: { bank_name: "FNB" },
    cancellation_policies: [{ days: "7", forfeit: "50" }],
    unique_selling_points: "Cliff views",
    meal_plan: "breakfast",
    facilities: ["wifi", "pool"],
  },
  owner_name: "Jane",
  owner_email: "stay@seesig.co.za",
  ru_location_id: 42,
};

describe("scoreWebsiteListing", () => {
  it("matches the open-wizard calculator after the same inventory hydrate", () => {
    const listed = scoreWebsiteListing({
      property: { ...baseProperty, amenities: { ...baseProperty.amenities, room_types: [] } },
      rooms: [{ id: "u1", name: "Sea View", is_active: true, max_guests: 4, daily_rate: 1850, total_units: 1 }],
    });
    const opened = calculateWebsiteWizardScore({
      ...baseProperty,
      amenities: {
        ...baseProperty.amenities,
        room_types: [{ id: "u1", name: "Sea View", max_guests: 4, base_rate: 1850 }],
      },
    });
    expect(listed).toBe(opened);
    expect(listed).toBeGreaterThanOrEqual(90);
  });
});
