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

/** Notification kinds, mirrored from `ruReservationParsing.ts` (imported loosely to stay shared-safe). */
export type EchoKind = 'confirmed' | 'modified' | 'cancelled' | 'request';

/**
 * Only OUR write of the same nature can echo as a given notification kind. A cancellation
 * notification is never an echo of a create, and a modification is never an echo of a cancel —
 * suppressing across kinds silently loses genuine channel-side changes.
 */
const VERBS_BY_KIND: Record<EchoKind, string[]> = {
  confirmed: ['Push_PutConfirmedReservationMulti_RQ', 'Push_ModifyStay_RQ'],
  request: ['Push_PutConfirmedReservationMulti_RQ'],
  modified: ['Push_ModifyStay_RQ'],
  cancelled: ['Push_CancelReservation_RQ', 'Push_RejectRequest_RQ'],
};

/** `includes()` let a short reservation id match a longer one; require a non-digit boundary. */
function xmlMentionsReservation(xml: string, reservationId: string): boolean {
  const escaped = reservationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!\\d)${escaped}(?!\\d)`).test(xml);
}

export interface RuOwnPushEcho {
  bookingId: string | null;
  pushedAt: string;
}

/** Reservation-level writes we make ourselves; RU echoes every one of them straight back. */
const OWN_PUSH_VERBS = [
  'Push_PutConfirmedReservationMulti_RQ',
  'Push_ModifyStay_RQ',
  'Push_CancelReservation_RQ',
  'Push_RejectRequest_RQ',
];

/**
 * The wire log is the only evidence that survives a cancellation: cancelling clears the
 * booking's channel reservation id, and the outbound trail row is written *after* RU has
 * already echoed, so a booking-keyed lookup misses both the cancel and modify echoes and the
 * handler fans a detail pull across every account for a reservation RU no longer serves.
 */
async function findOwnPushOnTheWire(
  supabase: Db,
  reservationId: string,
  verbs: string[],
): Promise<RuOwnPushEcho | null> {
  const sinceIso = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('ru_api_log')
    .select('action, created_at, request_xml')
    .eq('direction', 'outbound')
    .in('action', verbs)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(40);

  const hit = (data ?? []).find((row: { request_xml?: string | null }) =>
    typeof row?.request_xml === 'string' && xmlMentionsReservation(row.request_xml, reservationId)
  );
  return hit ? { bookingId: null, pushedAt: String(hit.created_at) } : null;
}

export async function findRuOwnPushEcho(
  supabase: Db,
  reservationId: string | null | undefined,
  kind?: EchoKind | null,
): Promise<RuOwnPushEcho | null> {
  const id = String(reservationId ?? '').trim();
  if (!id) return null;
  const verbs = kind ? VERBS_BY_KIND[kind] ?? OWN_PUSH_VERBS : OWN_PUSH_VERBS;

  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('external_reservation_id', id)
      .limit(1)
      .maybeSingle();
    if (!booking?.id) return await findOwnPushOnTheWire(supabase, id, verbs);



    const sinceIso = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
    const { data: events } = await supabase
      .from('channel_booking_events')
      .select('created_at')
      .eq('booking_id', booking.id)
      .eq('direction', 'outbound')
      // `skipped` means nothing was actually sent, so it can never be the cause of an echo.
      .in('outcome', ['pushed', 'queued'])
      .in('action', verbs)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1);

    const pushedAt = events?.[0]?.created_at as string | undefined;
    // The trail row for an interactive save lands after RU has echoed, so the wire log is the
    // fallback proof that the change originated here.
    if (!pushedAt) {
      const onWire = await findOwnPushOnTheWire(supabase, id, verbs);
      return onWire ? { ...onWire, bookingId: String(booking.id) } : null;
    }
    return { bookingId: String(booking.id), pushedAt };

  } catch (_err) {
    // Never let echo detection break notification handling — fall through to normal ingest.
    return null;
  }
}

export default findRuOwnPushEcho;
