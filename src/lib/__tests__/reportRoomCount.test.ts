import { describe, expect, it } from "vitest";
import { roomCountFromLedger, sanitiseRoomCount } from "../../../supabase/functions/_shared/reportRoomCount";

describe("sanitiseRoomCount", () => {
  it("keeps a plausible room count", () => {
    expect(sanitiseRoomCount(9)).toEqual({ roomCount: 9, warning: null });
  });

  it("reads a very large figure back as capacity days", () => {
    const result = sanitiseRoomCount(3225);
    expect(result.roomCount).toBe(106);
    expect(result.warning).toContain("capacity days");
  });
});

describe("roomCountFromLedger", () => {
  it("counts distinct guest rooms, ignoring case and spacing", () => {
    expect(
      roomCountFromLedger([
        { room_name: "Sea View" },
        { room_name: "sea  view" },
        { room_name: "Garden Suite" },
        { room_name: "Loft" },
      ]),
    ).toBe(3);
  });

  it("leaves out labels that are not sellable guest rooms", () => {
    expect(
      roomCountFromLedger([
        { room_name: "Room 0" },
        { room_name: "Events" },
        { room_name: "holding" },
        { room_name: "" },
        { room_name: "-" },
        { room_name: "Cottage" },
      ]),
    ).toBe(1);
  });
});
