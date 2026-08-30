/**
 * Was this inbound notification caused by OUR OWN push?
 *
 * When ROL'OS registers a stay with `Push_PutConfirmedReservationMulti_RQ`, Rentals United
 * immediately notifies us back about the very reservation we just created — often twice
 * (a `ReservationConfirmed` and a `ReservationRequest` echo). Treating those echoes as
 * channel-sourced changes is pure junk traffic:
 *
 *  - the ingest rewrites the booking, whose trigger then pushes a `Push_ModifyStay_RQ` for a
 *    reservation that is already exactly what we asked for;
 *  - the `request` echo carries no stay data, so the detail pull fans out
 *    `Pull_GetReservationByID_RQ` / `Pull_GetLeads_RQ` / `Pull_ListReservations_RQ` across every
 *    keyed account, trips the -6 rate limit, and the fast-retry ladder replays the whole fan-out.
 *
 * A notification is an echo when its ReservationID belongs to a local booking that we handed to
 * the channel ourselves inside `ECHO_WINDOW_MS`. Outside that window the channel really is telling
 * us something new, so it must be ingested normally.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

const ECHO_WINDOW_MS = 10 * 60 * 1000;

export interface RuOwnPushEcho {
  bookingId: string;
  pushedAt: string;
}

export async function findRuOwnPushEcho(
  supabase: Db,
  reservationId: string | null | undefined,
): Promise<RuOwnPushEcho | null> {
  const id = String(reservationId ?? '').trim();
  if (!id) return null;

  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('external_reservation_id', id)
      .limit(1)
      .maybeSingle();
    if (!booking?.id) return null;

    const sinceIso = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
    const { data: events } = await supabase
      .from('channel_booking_events')
      .select('created_at')
      .eq('booking_id', booking.id)
      .eq('direction', 'outbound')
      .in('outcome', ['pushed', 'queued'])
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1);

    const pushedAt = events?.[0]?.created_at as string | undefined;
    if (!pushedAt) return null;
    return { bookingId: String(booking.id), pushedAt };
  } catch (_err) {
    // Never let echo detection break notification handling — fall through to normal ingest.
    return null;
  }
}

export default findRuOwnPushEcho;
