import { describe, expect, it } from "vitest";
import {
  fillWebsiteWizardAmenities,
  hydrateWebsiteWizardAmenitiesFromInventory,
  mergeWizardRooms,
  normalizeWizardRoom,
  roomHasMaxGuests,
  roomHasRate,
} from "./websiteWizardHydrate";

describe("websiteWizardHydrate", () => {
  it("reads max guests and rates from RU field names", () => {
    const room = normalizeWizardRoom({
      id: "u1",
      name: "Sea View",
      maxPeople: 4,
      daily_rate: 1850,
    });
    expect(room.max_guests).toBe(4);
    expect(room.base_rate).toBe(1850);
    expect(roomHasMaxGuests(room as unknown as Record<string, unknown>)).toBe(true);
    expect(roomHasRate(room as unknown as Record<string, unknown>)).toBe(true);
  });

  it("fills blank wizard rooms from inventory without wiping filled values", () => {
    const merged = mergeWizardRooms(
      [{ id: "u1", name: "Sea View", max_guests: 0, base_rate: undefined }],
      [{ id: "u1", name: "Sea View", units: 1, max_guests: 4, base_rate: 1850, rate_unit: "per_night" }],
    );
    expect(merged[0].max_guests).toBe(4);
    expect(merged[0].base_rate).toBe(1850);
  });

  it("uses inventory when the wizard has no rooms yet", () => {
    const merged = mergeWizardRooms([], [
      { id: "u1", name: "Garden", units: 2, max_guests: 2, base_rate: 900, rate_unit: "per_night" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Garden");
    expect(merged[0].max_guests).toBe(2);
  });

  it("copies RU property fields into website wizard keys without overwriting", () => {
    const filled = fillWebsiteWizardAmenities(
      {
        star_rating: 4,
        contact: { email: "stay@seesig.co.za", telephone: "+27 21 000 0000", owner: "Jane" },
        house_rules: { check_in_instructions: "Collect keys at reception" },
        address_details: { province: "Western Cape" },
        cancellation_policies: [{ days: "7", forfeit: "50", type: "% of Total" }],
      },
      { ru_location_id: 42, owner_name: "Jane", owner_email: "stay@seesig.co.za" },
    );
    expect(filled.star_grading).toBe("4");
    expect(filled.contact_email).toBe("stay@seesig.co.za");
    expect(filled.telephone).toBe("+27 21 000 0000");
    expect(filled.main_contact_name).toBe("Jane");
    expect(filled.ru_location_id).toBe(42);
    expect(filled.region).toBe("Western Cape");
    expect((filled.house_rules as { key_collection_procedure: string }).key_collection_procedure).toContain(
      "Collect keys",
    );
  });

  it("hydrates rooms from inventory the same way the Website wizard does", () => {
    const filled = hydrateWebsiteWizardAmenitiesFromInventory(
      { room_types: [] },
      { owner_email: "stay@seesig.co.za", price_per_night: 1800 },
      {
        rooms: [{ id: "u1", name: "Sea View", is_active: true, max_guests: 4, total_units: 1 }],
        ratePlans: [{ base_rate: 1850, is_primary_sell: true, is_active: true }],
      },
    );
    const rooms = filled.room_types as { name: string; max_guests: number; base_rate?: number }[];
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe("Sea View");
    expect(rooms[0].max_guests).toBe(4);
    expect(rooms[0].base_rate).toBe(1850);
  });
});
