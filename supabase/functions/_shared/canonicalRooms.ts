/**
 * canonicalRooms — one truth about "which room row is the live one".
 *
 * ROL'OS properties have accumulated duplicate `rolos_room_types` / `rolos_rooms`
 * rows for the same physical unit (ALL-CAPS legacy copies next to the current
 * mixed-case set). Every consumer must agree on exactly one canonical row per
 * room name, and must treat every twin as **superseded**: never matched by an
 * importer, never selectable, never pushed to a channel.
 *
 * Canonical rule, per normalised room name:
 *   1. the room type a live channel unit links to (`hostfully_room_types.linked_rolos_id`)
 *   2. otherwise an active type whose name matches the channel unit name exactly
 *   3. otherwise the most recently created active type
 *   4. only if nothing is active: the most recently created type
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export const normaliseRoomName = (value: string | null | undefined): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface CanonicalRoom {
  /** normalised room name */
  key: string;
  /** display name of the canonical room type */
  name: string;
  roomTypeId: string;
  roomId: string | null;
  roomLabel: string | null;
  /** channel unit ids (hostfully_room_types) that represent this room */
  unitIds: string[];
}

export interface CanonicalRoomRegistry {
  byKey: Map<string, CanonicalRoom>;
  /** every room-type id for a name, canonical first */
  typeIdsByKey: Map<string, string[]>;
  keyByTypeId: Map<string, string>;
  keyByRoomId: Map<string, string>;
  supersededTypeIds: Set<string>;
  supersededRoomIds: Set<string>;
  /** canonical type id for a channel unit (by link, then by name) */
  canonicalForUnit: (unit: { id?: string | null; name?: string | null; linked_rolos_id?: string | null }) => CanonicalRoom | null;
}

interface TypeRow {
  id: string;
  name: string | null;
  code?: string | null;
  is_active: boolean | null;
  created_at: string | null;
  linked_overview_id: string | null;
}

interface RoomRow {
  id: string;
  room_name: string | null;
  room_number: string | null;
  room_type_id: string | null;
  created_at?: string | null;
}

interface UnitRow {
  id: string;
  name: string | null;
  is_active: boolean | null;
  linked_rolos_id: string | null;
  rentalsunited_property_id: string | number | null;
}

const time = (v: string | null | undefined): number => {
  const t = new Date(String(v ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
};

export async function loadCanonicalRooms(sb: Db, propertyId: string): Promise<CanonicalRoomRegistry> {
  const [types, rooms, units] = await Promise.all([
    sb
      .from("rolos_room_types")
      .select("id, name, code, is_active, created_at, linked_overview_id")
      .eq("property_id", propertyId),
    sb
      .from("rolos_rooms")
      .select("id, room_name, room_number, room_type_id, created_at")
      .eq("property_id", propertyId),
    sb
      .from("hostfully_room_types")
      .select("id, name, is_active, linked_rolos_id, rentalsunited_property_id")
      .eq("property_id", propertyId),
  ]);

  const typeRows = ((types?.data ?? []) as TypeRow[]).filter((t) => t?.id);
  const roomRows = ((rooms?.data ?? []) as RoomRow[]).filter((r) => r?.id);
  const unitRows = ((units?.data ?? []) as UnitRow[]).filter((u) => u?.id);

  const liveUnits = unitRows.filter((u) => u.is_active !== false);
  const linkedTypeIds = new Set(liveUnits.map((u) => u.linked_rolos_id).filter(Boolean) as string[]);
  const unitNameByKey = new Map<string, string>();
  const unitIdsByKey = new Map<string, string[]>();
  for (const u of liveUnits) {
    const key = normaliseRoomName(u.name);
    if (!key) continue;
    if (!unitNameByKey.has(key)) unitNameByKey.set(key, String(u.name ?? ""));
    unitIdsByKey.set(key, [...(unitIdsByKey.get(key) ?? []), u.id]);
  }

  // group types by normalised name
  const typesByKey = new Map<string, TypeRow[]>();
  for (const t of typeRows) {
    const key = normaliseRoomName(t.name) || normaliseRoomName(t.code);
    if (!key) continue;
    typesByKey.set(key, [...(typesByKey.get(key) ?? []), t]);
  }

  const rank = (t: TypeRow, key: string): number => {
    let score = 0;
    if (linkedTypeIds.has(t.id)) score += 8000;
    if (t.is_active !== false) score += 4000;
    const unitName = unitNameByKey.get(key);
    if (unitName && String(t.name ?? "") === unitName) score += 2000;
    if (t.linked_overview_id) score += 500;
    return score;
  };

  const byKey = new Map<string, CanonicalRoom>();
  const typeIdsByKey = new Map<string, string[]>();
  const keyByTypeId = new Map<string, string>();
  const keyByRoomId = new Map<string, string>();
  const supersededTypeIds = new Set<string>();
  const supersededRoomIds = new Set<string>();

  for (const [key, list] of typesByKey) {
    const sorted = [...list].sort((a, b) => {
      const diff = rank(b, key) - rank(a, key);
      if (diff !== 0) return diff;
      return time(b.created_at) - time(a.created_at);
    });
    const canonicalType = sorted[0];
    typeIdsByKey.set(key, sorted.map((t) => t.id));
    for (const t of sorted) keyByTypeId.set(t.id, key);
    for (const t of sorted.slice(1)) supersededTypeIds.add(t.id);

    const candidateRooms = roomRows.filter((r) => r.room_type_id === canonicalType.id);
    const unitName = unitNameByKey.get(key);
    const roomSorted = [...candidateRooms].sort((a, b) => {
      const exact = (r: RoomRow) => (unitName && String(r.room_name ?? "") === unitName ? 1 : 0);
      const diff = exact(b) - exact(a);
      if (diff !== 0) return diff;
      return time(b.created_at) - time(a.created_at);
    });
    const canonicalRoom = roomSorted[0] ?? null;

    byKey.set(key, {
      key,
      name: String(canonicalType.name ?? unitName ?? key),
      roomTypeId: canonicalType.id,
      roomId: canonicalRoom?.id ?? null,
      roomLabel: canonicalRoom ? canonicalRoom.room_name || canonicalRoom.room_number || null : null,
      unitIds: unitIdsByKey.get(key) ?? [],
    });
  }

  for (const r of roomRows) {
    const key = (r.room_type_id && keyByTypeId.get(r.room_type_id)) || normaliseRoomName(r.room_name) || normaliseRoomName(r.room_number);
    if (key) keyByRoomId.set(r.id, key);
    const canonical = key ? byKey.get(key) : null;
    if (!canonical || canonical.roomId !== r.id) supersededRoomIds.add(r.id);
  }

  const canonicalForUnit = (unit: { id?: string | null; name?: string | null; linked_rolos_id?: string | null }) => {
    if (unit.linked_rolos_id) {
      const key = keyByTypeId.get(unit.linked_rolos_id);
      if (key) return byKey.get(key) ?? null;
    }
    const key = normaliseRoomName(unit.name);
    return key ? byKey.get(key) ?? null : null;
  };

  return {
    byKey,
    typeIdsByKey,
    keyByTypeId,
    keyByRoomId,
    supersededTypeIds,
    supersededRoomIds,
    canonicalForUnit,
  };
}
