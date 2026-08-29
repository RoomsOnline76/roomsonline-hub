/**
 * Who is this stay AT THE CHANNEL?
 *
 * An extension, a shortening, a move or a re-price is a MODIFICATION of an existing channel
 * reservation. The only thing that makes `Push_ModifyStay_RQ` possible is the channel's own
 * ReservationID plus the dates/listing the channel currently holds. When the local booking row
 * has lost that id (ingested before we stored it, or a create that only settled in the rate-limit
 * queue), verb selection used to fall through to `Push_PutConfirmedReservationMulti_RQ` — and the
 * channel then evaluated the extension as a SECOND booking on nights the first one already owns.
 *
 * This module resolves identity from, in order:
 *   1. the booking's own `external_reservation_id`;
 *   2. a delivered reservation-op claim that recorded the channel's id;
 *   3. a still-pending registration in the call queue (identity is "in flight" — never create again);
 *   4. the child account's own reservation list, matched on listing + stay + guest.
 *
 * It never guesses. An unresolved identity is reported as such so the caller can park the edit for
 * reconciliation instead of registering a duplicate.
 */
import { extractAllBlocks, parseRuReservation } from './ruReservationParsing.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RuIdentityBooking {
  id: string;
  property_id: string;
  room_type_id?: string | null;
  external_reservation_id?: string | null;
  channel_listing_id?: string | null;
  check_in_date: string;
  check_out_date: string;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
}

export interface RuReservationIdentity {
  /** The channel's ReservationID, when it could be resolved with certainty. */
  reservationId: string | null;
  /** The listing the channel holds the reservation on. */
  listing: string | null;
  /** The stay the channel currently holds — authoritative `<Current>` for a modification. */
  currentDateFrom: string | null;
  currentDateTo: string | null;
  /** The channel answered "no such reservation": there is nothing to modify. */
  absent: boolean;
  /** A first registration for this booking is still queued — identity is in flight. */
  pendingCreate: boolean;
  source: 'booking' | 'claim' | 'channel_match' | 'queued_create' | 'none';
}

const EMPTY: RuReservationIdentity = {
  reservationId: null,
  listing: null,
  currentDateFrom: null,
  currentDateTo: null,
  absent: false,
  pendingCreate: false,
  source: 'none',
};

function isAbsentMessage(text?: string | null): boolean {
  return /reservation does not exist|no such reservation/i.test(String(text ?? ''));
}

/** A registration for this booking that the channel's rate window has not delivered yet. */
export async function hasPendingRuCreate(supabase: Db, bookingId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('ru_call_queue')
      .select('id')
      .eq('action', 'push_confirmed_reservation')
      .in('status', ['pending', 'claimed'])
      .or(`method_key.eq.push_confirmed_reservation:${bookingId},payload->>booking_id.eq.${bookingId}`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch (_err) {
    return false;
  }
}

/** Ask the channel for the reservation's current state (listing + held dates). */
async function readChannelState(
  supabase: Db,
  booking: RuIdentityBooking,
  reservationId: string,
): Promise<{ listing: string | null; dateFrom: string | null; dateTo: string | null; absent: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action: 'get_reservation_by_id',
        reservation_id: reservationId,
        property_id: booking.property_id,
        deferrable: true,
      },
    });
    if (error) return { listing: null, dateFrom: null, dateTo: null, absent: false };
    const reservation = data?.reservation as
      | { ruPropertyId?: string | null; dateFrom?: string | null; dateTo?: string | null }
      | null;
    if (!reservation?.ruPropertyId && !reservation?.dateFrom) {
      const absent = data?.found === false ||
        isAbsentMessage(typeof data?.raw_xml === 'string' ? data.raw_xml : null);
      return { listing: null, dateFrom: null, dateTo: null, absent };
    }
    return {
      listing: reservation.ruPropertyId ? String(reservation.ruPropertyId) : null,
      dateFrom: reservation.dateFrom ? String(reservation.dateFrom).slice(0, 10) : null,
      dateTo: reservation.dateTo ? String(reservation.dateTo).slice(0, 10) : null,
      absent: false,
    };
  } catch (_err) {
    return { listing: null, dateFrom: null, dateTo: null, absent: false };
  }
}

/**
 * Search the child account's own reservations for this exact stay. Only a UNIQUE match on
 * listing + arrival (or guest surname) is accepted; anything ambiguous stays unresolved.
 */
async function matchAtChannel(
  supabase: Db,
  booking: RuIdentityBooking,
  listing: string | null,
): Promise<RuReservationIdentity | null> {
  const from = booking.check_in_date?.slice(0, 10);
  const to = booking.check_out_date?.slice(0, 10);
  if (!from || !to) return null;

  // A widened window: an extension has already rewritten the local dates, so the channel-held
  // stay may start or end outside the new span.
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action: 'list_reservations',
        property_id: booking.property_id,
        date_from: shift(from, -14),
        date_to: shift(to, 14),
        deferrable: true,
      },
    });
    if (error || typeof data?.raw_xml !== 'string') return null;

    const surname = String(booking.guest_last_name ?? '').trim().toLowerCase();
    const candidates = extractAllBlocks(data.raw_xml, 'Reservation')
      .map((block) => parseRuReservation(block))
      .filter((r) => !!r.ruReservationId)
      .filter((r) => (listing ? String(r.ruPropertyId ?? '') === String(listing) : true))
      .filter((r) => {
        const sameArrival = (r.dateFrom ?? '').slice(0, 10) === from;
        const sameGuest = surname.length > 2 && r.guestName.toLowerCase().includes(surname);
        return sameArrival || sameGuest;
      });

    const unique = new Map(candidates.map((r) => [String(r.ruReservationId), r]));
    if (unique.size !== 1) return null;
    const match = [...unique.values()][0];
    return {
      reservationId: String(match.ruReservationId),
      listing: match.ruPropertyId ? String(match.ruPropertyId) : listing,
      currentDateFrom: match.dateFrom ? String(match.dateFrom).slice(0, 10) : null,
      currentDateTo: match.dateTo ? String(match.dateTo).slice(0, 10) : null,
      absent: false,
      pendingCreate: false,
      source: 'channel_match',
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Resolve the channel identity of a local booking. Never returns a guess: when `reservationId` is
 * null the caller must either register the stay for the FIRST time (only when `pendingCreate` is
 * false and the booking has genuinely never been handed over) or park the edit.
 */
export async function resolveRuReservationIdentity(
  supabase: Db,
  booking: RuIdentityBooking,
  opts: { askChannel?: boolean; persist?: boolean } = {},
): Promise<RuReservationIdentity> {
  const askChannel = opts.askChannel !== false;
  const persist = opts.persist !== false;
  const listedOn = booking.channel_listing_id ? String(booking.channel_listing_id) : null;

  const local = String(booking.external_reservation_id ?? '').trim();
  if (local) {
    const state = askChannel ? await readChannelState(supabase, booking, local) : null;
    return {
      reservationId: state?.absent ? null : local,
      listing: state?.listing ?? listedOn,
      currentDateFrom: state?.dateFrom ?? null,
      currentDateTo: state?.dateTo ?? null,
      absent: state?.absent === true,
      pendingCreate: false,
      source: 'booking',
    };
  }

  // A previous delivery recorded the channel's id even though the booking row lost it.
  try {
    const { data: claims } = await supabase
      .from('ru_reservation_op_claims')
      .select('reservation_id, ru_property_id, outcome, settled_at')
      .eq('booking_id', booking.id)
      .eq('outcome', 'delivered')
      .not('reservation_id', 'is', null)
      .order('settled_at', { ascending: false })
      .limit(1);
    const claimed = (claims ?? [])[0] as { reservation_id?: string; ru_property_id?: string } | undefined;
    if (claimed?.reservation_id) {
      const id = String(claimed.reservation_id).trim();
      const state = askChannel ? await readChannelState(supabase, booking, id) : null;
      if (!state?.absent) {
        if (persist) await persistIdentity(supabase, booking, id, state?.listing ?? claimed.ru_property_id ?? null);
        return {
          reservationId: id,
          listing: state?.listing ?? claimed.ru_property_id ?? listedOn,
          currentDateFrom: state?.dateFrom ?? null,
          currentDateTo: state?.dateTo ?? null,
          absent: false,
          pendingCreate: false,
          source: 'claim',
        };
      }
    }
  } catch (_err) {
    // Claim ledger is evidence, not a dependency.
  }

  if (await hasPendingRuCreate(supabase, booking.id)) {
    return { ...EMPTY, pendingCreate: true, listing: listedOn, source: 'queued_create' };
  }

  if (askChannel) {
    const matched = await matchAtChannel(supabase, booking, listedOn);
    if (matched?.reservationId) {
      if (persist) await persistIdentity(supabase, booking, matched.reservationId, matched.listing);
      return matched;
    }
  }

  return { ...EMPTY, listing: listedOn };
}

/** Store a uniquely resolved identity so every later edit follows the same reservation. */
async function persistIdentity(
  supabase: Db,
  booking: RuIdentityBooking,
  reservationId: string,
  listing: string | null,
): Promise<void> {
  try {
    await supabase
      .from('bookings')
      .update({
        external_reservation_id: reservationId,
        ...(listing ? { channel_listing_id: String(listing) } : {}),
      })
      .eq('id', booking.id);
    booking.external_reservation_id = reservationId;
    if (listing) booking.channel_listing_id = String(listing);
  } catch (_err) {
    // A failed write must not stop the modification: the id is carried in memory for this run.
  }
}
