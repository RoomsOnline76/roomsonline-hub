export interface BookingRoomCapacityLine {
  room_type_id?: string | null;
  status?: string | null;
}

export interface RoomTypeCapacity {
  id: string;
  max_occupancy?: number | null;
}

/**
 * Capacity belongs to the units allocated to the stay. Property max_guests is only
 * a legacy fallback when none of those units has a measured capacity.
 */
export function resolveBookingCapacity(
  lines: BookingRoomCapacityLine[],
  roomTypes: RoomTypeCapacity[],
  bookingRoomTypeId: string | null | undefined,
  propertyMaxGuests: number | null | undefined,
): number | null {
  const capacityByType = new Map(
    roomTypes
      .map((roomType) => [String(roomType.id), Number(roomType.max_occupancy ?? 0)] as const)
      .filter(([, capacity]) => capacity > 0),
  );
  const activeTypeIds = lines
    .filter((line) => (line.status ?? "active") === "active")
    .map((line) => line.room_type_id ? String(line.room_type_id) : "")
    .filter(Boolean);
  const typeIds = activeTypeIds.length > 0
    ? activeTypeIds
    : bookingRoomTypeId
      ? [String(bookingRoomTypeId)]
      : [];

  if (typeIds.length > 0 && typeIds.every((id) => capacityByType.has(id))) {
    const total = typeIds.reduce((sum, id) => sum + (capacityByType.get(id) ?? 0), 0);
    return total > 0 ? total : null;
  }

  const fallback = Number(propertyMaxGuests ?? 0);
  return fallback > 0 ? fallback : null;
}

export function countedGuests(input: {
  adults?: number | null;
  children?: number | null;
  teens?: number | null;
}): number {
  return Math.max(0, Number(input.adults ?? 0)) +
    Math.max(0, Number(input.children ?? 0)) +
    Math.max(0, Number(input.teens ?? 0));
}
