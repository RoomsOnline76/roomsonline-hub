/**
 * Room alias resolver — matches a room across DB UUID, PMS-native ID,
 * external_room_type_id, cached raw PMS ID, and normalized name.
 */

export interface RoomCandidate {
  room_type_id?: string;
  roomTypeId?: string;
  room_type_name?: string;
  roomTypeName?: string;
  name?: string;
  room_type_aliases?: string[];
  raw_data?: { roomTypeId?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function getId(room: RoomCandidate): string {
  return String(room.room_type_id ?? room.roomTypeId ?? "");
}

function getName(room: RoomCandidate): string {
  return String(room.room_type_name ?? room.roomTypeName ?? room.name ?? "");
}

/**
 * Build a set of all known IDs for a given room definition.
 * Includes: DB UUID, external_room_type_id, raw PMS ID, normalized name.
 */
export function buildRoomAliases(
  dbUuid: string,
  externalRoomTypeId?: string | null,
  rawPmsId?: string | null,
  roomName?: string | null,
): Set<string> {
  const aliases = new Set<string>();
  if (dbUuid) aliases.add(dbUuid);
  if (externalRoomTypeId) aliases.add(externalRoomTypeId);
  if (rawPmsId) aliases.add(rawPmsId);
  if (roomName) aliases.add(normalize(roomName));
  return aliases;
}

/**
 * Find a matching room from a list of candidates using multi-strategy matching.
 * Returns the matched candidate or null.
 */
export function resolveRoom(
  candidates: RoomCandidate[],
  targetId: string,
  targetName?: string,
  extraAliases?: Set<string>,
): { room: RoomCandidate; matchSource: string } | null {
  const aliases = new Set<string>();
  if (targetId) aliases.add(targetId);
  if (targetName) aliases.add(normalize(targetName));
  if (extraAliases) extraAliases.forEach((a) => aliases.add(a));

  for (const c of candidates) {
    const cId = getId(c);

    // 1. Direct ID match (DB UUID or PMS-native)
    if (cId && aliases.has(cId)) {
      return { room: c, matchSource: `id:${cId}` };
    }

    // 2. Check candidate's own aliases array
    if (c.room_type_aliases) {
      for (const a of c.room_type_aliases) {
        if (aliases.has(a)) {
          return { room: c, matchSource: `alias:${a}` };
        }
      }
    }

    // 3. Raw PMS ID inside raw_data
    const rawId = c.raw_data?.roomTypeId;
    if (rawId && aliases.has(String(rawId))) {
      return { room: c, matchSource: `raw:${rawId}` };
    }

    // 4. Normalized name match
    const cName = getName(c);
    if (cName && aliases.has(normalize(cName))) {
      return { room: c, matchSource: `name:${cName}` };
    }
  }

  return null;
}
