/**
 * Some properties carry more than one active `rolos_room_types` row for the same
 * physical unit (legacy imports / re-syncs). The Edit rate plan surfaces are a
 * display of units, so the same name must appear once — otherwise operators see
 * "Oester" twice, one ticked and one not, and cannot tell which one sells.
 *
 * Pure and display-only: it never writes, never merges data, and always keeps
 * the id the plan is already linked to so no existing link is dropped.
 */

export interface RoomTypeLike {
  id: string;
  name: string;
}

const keyOf = (name: string) => (name || "").trim().toLowerCase();

export function dedupeRoomTypesByName<T extends RoomTypeLike>(
  roomTypes: readonly T[],
  /** Ids already linked to the plan — these win over their duplicates. */
  preferredIds: readonly string[] = [],
): T[] {
  const preferred = new Set(preferredIds);
  const picked = new Map<string, T>();

  for (const rt of roomTypes || []) {
    const key = keyOf(rt.name) || rt.id;
    const existing = picked.get(key);
    if (!existing) {
      picked.set(key, rt);
      continue;
    }
    // First row wins unless a later duplicate is the one the plan actually uses.
    if (!preferred.has(existing.id) && preferred.has(rt.id)) picked.set(key, rt);
  }

  return [...picked.values()];
}
