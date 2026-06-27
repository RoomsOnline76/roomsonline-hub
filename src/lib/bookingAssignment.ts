/**
 * Auto-assigns bookings to rooms when rolos_room_ids is empty/null.
 *
 * Strategy:
 *  1. First try to match the booking's room_type_id directly to rooms.
 *  2. If that fails (duplicate / orphan room_type rows) and a `roomTypes`
 *     index is supplied, resolve booking.room_type_id → type name → any room
 *     whose room_type's name matches (case-insensitive).
 *  3. Round-robin to the first non-conflicting candidate.
 *
 * Presentation-only — DB rows are not mutated.
 */
export interface AssignableBooking {
  id: string;
  check_in_date: string;
  check_out_date: string;
  room_type_id?: string | null;
  rolos_room_ids?: string[] | null;
}

export interface AssignableRoom {
  id: string;
  room_type_id: string | null;
  status?: string | null;
}

export interface AssignableRoomType {
  id: string;
  name: string;
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

export function autoAssignBookings<T extends AssignableBooking>(
  bookings: T[],
  rooms: AssignableRoom[],
  roomTypes: AssignableRoomType[] = []
): T[] {
  if (!bookings.length || !rooms.length) return bookings;

  // type-id → rooms
  const roomsByType = new Map<string, AssignableRoom[]>();
  for (const r of rooms) {
    if (!r.room_type_id) continue;
    if (!roomsByType.has(r.room_type_id)) roomsByType.set(r.room_type_id, []);
    roomsByType.get(r.room_type_id)!.push(r);
  }

  // type-name → rooms (fallback for duplicate / orphan room_type rows)
  const typeNameById = new Map<string, string>();
  for (const t of roomTypes) typeNameById.set(t.id, norm(t.name));

  const roomsByTypeName = new Map<string, AssignableRoom[]>();
  for (const r of rooms) {
    const tn = r.room_type_id ? typeNameById.get(r.room_type_id) : "";
    if (!tn) continue;
    if (!roomsByTypeName.has(tn)) roomsByTypeName.set(tn, []);
    roomsByTypeName.get(tn)!.push(r);
  }

  // Track occupied date ranges per room id (start inclusive, end exclusive)
  const roomOccupancy = new Map<string, Array<{ start: string; end: string }>>();
  const recordOcc = (roomId: string, b: AssignableBooking) => {
    if (!roomOccupancy.has(roomId)) roomOccupancy.set(roomId, []);
    roomOccupancy.get(roomId)!.push({ start: b.check_in_date, end: b.check_out_date });
  };
  const conflicts = (roomId: string, b: AssignableBooking) => {
    const list = roomOccupancy.get(roomId);
    if (!list) return false;
    return list.some(o => !(b.check_out_date <= o.start || b.check_in_date >= o.end));
  };

  // First pass: pre-populate occupancy for already-assigned bookings
  for (const b of bookings) {
    const ids = b.rolos_room_ids || [];
    for (const id of ids) recordOcc(id, b);
  }

  return bookings.map(b => {
    const ids = b.rolos_room_ids || [];
    if (ids.length > 0) return b;
    if (!b.room_type_id) return b;

    let candidates = roomsByType.get(b.room_type_id) || [];
    if (candidates.length === 0) {
      const tn = typeNameById.get(b.room_type_id);
      if (tn) candidates = roomsByTypeName.get(tn) || [];
    }
    if (candidates.length === 0) return b;

    const pick = candidates.find(r => r.status !== "out_of_service" && !conflicts(r.id, b))
      || candidates[0];
    recordOcc(pick.id, b);
    return { ...b, rolos_room_ids: [pick.id] };
  });
}
