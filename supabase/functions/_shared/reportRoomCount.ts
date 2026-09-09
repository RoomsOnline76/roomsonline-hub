/**
 * Sellable-room sanity guard for report runs.
 *
 * Capacity is `room_count x days in month`, so a room count that was actually
 * captured as *monthly capacity days* (e.g. 3225 = 104 rooms x 31 nights)
 * silently divides occupancy by ~30 and prints a 1% occupancy chart. No ROL
 * property has hundreds of sellable rooms, so a very large figure is read back
 * as capacity days and converted, with a warning for the run log.
 */

const AVERAGE_MONTH_DAYS = 30.4;
/** Above this, a "room count" is capacity days rather than rooms. */
export const MAX_PLAUSIBLE_ROOMS = 400;

export interface RoomCountCheck {
  /** The room count the aggregator should use. */
  roomCount: number;
  /** Human-readable warning when the configured value was corrected. */
  warning: string | null;
}

export function sanitiseRoomCount(configured: number | null | undefined): RoomCountCheck {
  const value = Number(configured);
  if (!Number.isFinite(value) || value <= 0) return { roomCount: 0, warning: null };

  if (value > MAX_PLAUSIBLE_ROOMS) {
    const derived = Math.max(1, Math.round(value / AVERAGE_MONTH_DAYS));
    return {
      roomCount: derived,
      warning:
        `Sellable rooms is set to ${value}, which reads as monthly capacity days rather than rooms. ` +
        `Using ${derived} sellable rooms for this run — correct the room count in Report Settings.`,
    };
  }

  return { roomCount: Math.floor(value), warning: null };
}

/**
 * Sellable rooms inferred from the export itself.
 *
 * When a property has no configured room count and no rooms captured in ROL'OS,
 * the old fallback was a single room, which printed occupancy of several hundred
 * percent for a guesthouse. The export names the unit on every line, so the
 * count of distinct guest-room labels is a far better floor. Holds, Room 0 and
 * function rooms are not sellable guest rooms and are left out.
 */
const NOT_A_GUEST_ROOM =
  /^(room ?0|events?|function|holding|conference|no ?room|unassigned|n\/?a|-|x)$/i;

export function roomCountFromLedger(rows: { room_name?: unknown }[]): number {
  const names = new Set<string>();
  for (const row of rows) {
    const name = String(row.room_name ?? "").trim();
    if (!name || NOT_A_GUEST_ROOM.test(name)) continue;
    names.add(name.toLowerCase().replace(/\s+/g, " "));
  }
  return names.size;
}

