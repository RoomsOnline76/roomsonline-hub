export interface RoomIdentityRow {
  id: string;
  name: string | null;
  isActive: boolean | null;
  listingId: string | null;
  createdAt?: string | null;
}

export const normalizeRoomIdentityName = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

/** Stable id wins; normalized name is only the fallback for an unpersisted room. */
export function resolvePersistedRoomIdentity(
  rows: RoomIdentityRow[],
  room: { id?: string | null; name?: string | null },
  claimedIds: Set<string>,
): RoomIdentityRow | null {
  const available = rows.filter((row) => !claimedIds.has(row.id));
  if (room.id && room.id.length === 36) {
    const byId = available.find((row) => row.id === room.id);
    if (byId) return byId;
  }
  const name = normalizeRoomIdentityName(room.name);
  if (!name) return null;
  return available
    .filter((row) => normalizeRoomIdentityName(row.name) === name)
    .sort(
      (a, b) =>
        Number(Boolean(b.listingId)) - Number(Boolean(a.listingId)) ||
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
    )[0] ?? null;
}