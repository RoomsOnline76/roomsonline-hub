/**
 * Nights that are owed a reservation write at the channel.
 *
 * Measured live on 2026-08-29 (Albatros listing 5966579, stay 2026-09-01 → 09-04): every
 * `Push_PutConfirmedReservationMulti_RQ` was refused with "Property is not available for a given
 * dates - Can't check in or check out on selected date" while the channel calendar read back
 * `Units="0" Reservations="0"` on exactly the stay nights. The block was OURS: the availability
 * delta publishes a locally sold stay as 0 units, and the channel then refuses the very
 * reservation that justified the closure. One writer reopened the nights, another (the full-window
 * `push_availability` rebuild, which derives sold nights from local bookings) closed them again,
 * and the create was replayed into that wall a dozen times.
 *
 * The rule this module enforces: **a stay is never published as sold until the channel has
 * accepted the reservation.** While a create or a modification is still owed, the stay's nights
 * are held OPEN — every availability writer skips them. The channel closes them itself the moment
 * the reservation registers, and the next delta restates the truth.
 *
 * A hold only exists while an obligation is genuinely open. A terminal refusal, a delivered
 * reservation, or an abandoned claim releases it, so nights can never stay open forever.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

/** An unsettled claim older than this is abandoned, not owed. */
const HOLD_TTL_MS = 2 * 60 * 60 * 1000;

/** Every night a stay occupies: check-in .. check-out − 1 (the departure day is not a night). */
export function stayNights(dateFrom: string, dateTo: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return [];
  const nights: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor < end && nights.length < 400) {
    nights.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

export interface ReservationHolds {
  /** Bookings whose reservation write is still owed to the channel. */
  bookingIds: Set<string>;
  /** Nights those bookings occupy — these must not be published as sold. */
  nights: Set<string>;
}

/** Booking ids with an open create/modify obligation at the channel. */
async function owedBookingIds(supabase: Db, bookingIds: string[]): Promise<Set<string>> {
  const owed = new Set<string>();
  if (bookingIds.length === 0) return owed;
  const since = new Date(Date.now() - HOLD_TTL_MS).toISOString();

  try {
    const { data: claims } = await supabase
      .from('ru_reservation_op_claims')
      .select('booking_id, op, outcome, claimed_at')
      .in('booking_id', bookingIds)
      .in('op', ['create', 'modify'])
      .eq('outcome', 'in_flight')
      .is('settled_at', null)
      .gte('claimed_at', since);
    for (const row of (claims ?? []) as Array<{ booking_id?: string }>) {
      if (row?.booking_id) owed.add(String(row.booking_id));
    }
  } catch (err) {
    console.warn('[ruReservationHold] claim lookup failed:', err);
  }

  try {
    const { data: queued } = await supabase
      .from('ru_call_queue')
      .select('payload, action, status, created_at')
      .in('action', ['push_confirmed_reservation', 'modify_stay'])
      .eq('status', 'pending')
      .gte('created_at', since)
      .limit(200);
    for (const row of (queued ?? []) as Array<{ payload?: Record<string, unknown> }>) {
      const id = String(row?.payload?.booking_id ?? '').trim();
      if (id && bookingIds.includes(id)) owed.add(id);
    }
  } catch (err) {
    console.warn('[ruReservationHold] queue lookup failed:', err);
  }

  return owed;
}

/**
 * Every night in [windowFrom, windowTo] that must stay open because its stay has not been accepted
 * by the channel yet. `candidates` are the local bookings the caller is about to publish as sold.
 */
export async function loadReservationWriteHolds(
  supabase: Db,
  candidates: Array<{
    id: string;
    check_in_date?: string | null;
    check_out_date?: string | null;
    external_reservation_id?: string | null;
  }>,
): Promise<ReservationHolds> {
  const holds: ReservationHolds = { bookingIds: new Set(), nights: new Set() };
  // A stay the channel already holds is closed by the channel itself — no hold needed.
  const pending = candidates.filter((b) => b?.id && !String(b.external_reservation_id ?? '').trim());
  if (pending.length === 0) return holds;

  const owed = await owedBookingIds(supabase, pending.map((b) => String(b.id)));
  if (owed.size === 0) return holds;

  for (const booking of pending) {
    if (!owed.has(String(booking.id))) continue;
    holds.bookingIds.add(String(booking.id));
    for (const night of stayNights(String(booking.check_in_date ?? ''), String(booking.check_out_date ?? ''))) {
      holds.nights.add(night);
    }
  }
  if (holds.bookingIds.size > 0) {
    console.log(
      `[ruReservationHold] ${holds.bookingIds.size} stay(s) still owed to the channel — ` +
        `${holds.nights.size} night(s) held open instead of published as sold`,
    );
  }
  return holds;
}

/**
 * Circuit breaker for blocked-dates refusals.
 *
 * A refusal on the stay's own nights is channel-side state we cannot always lift from here. The
 * live storm (12 identical creates for one stay across two sittings) burned the owner's
 * one-call-per-minute window without ever inventing a ReservationID, so after three refusals for
 * the same booking within the hour the write stops being attempted.
 */
export async function blockedDatesRefusalsThisHour(
  supabase: Db,
  bookingId: string,
  actions: string[] = ['push_confirmed_reservation', 'modify_stay'],
): Promise<number> {
  try {
    const { data } = await supabase
      .from('ru_sync_runs')
      .select('error_message, action')
      .in('action', actions)
      .eq('success', false)
      .contains('details', { booking_id: bookingId })
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
      .limit(30);
    return ((data ?? []) as Array<{ error_message?: string | null }>).filter((r) =>
      /not available for a given dates|check ?in or check ?out/i.test(String(r?.error_message ?? '')),
    ).length;
  } catch (err) {
    console.warn('[ruReservationHold] refusal count failed:', err);
    return 0;
  }
}

export const RU_BLOCKED_DATES_BREAKER_LIMIT = 3;
