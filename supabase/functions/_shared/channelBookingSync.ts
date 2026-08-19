/**
 * Single outbound entry point for "a booking changed — tell the channel".
 *
 * Every booking mutation surface in ROL'OS (manual create, drag-and-drop move, date/pax/price
 * edit, notes, mark-paid, cancel, no-show) funnels through here, either directly via the
 * `channel-booking-sync` function or through the `channel_booking_sync` background job the
 * database trigger enqueues. Two things always have to happen:
 *
 *  1. A reservation that ORIGINATED at the channel must be modified / cancelled at the channel,
 *     otherwise the channel keeps selling the old state.
 *  2. Availability and rates for the property must be re-pushed for ANY booking change, including
 *     locally created stays — that is what stops the channel double-selling a night.
 *
 * Rate limits are never treated as failures: the channel API parks the call in `ru_call_queue`
 * and answers `queued`, which is reported back as `deferred` so the UI can say so.
 */
import { queueRuAriDelta } from './ruAriDelta.ts';
import {
  cancelRuReservation,
  isRuBooking,
  isRuLead,
  modifyRuStay,
  resolveRuPropertyId,
} from './ruBookingSync.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export type ChannelBookingChange =
  | 'created'
  | 'moved'
  | 'dates'
  | 'pax'
  | 'price'
  | 'payment'
  | 'notes'
  | 'status'
  | 'cancelled'
  | 'deleted'
  | 'unknown';

export interface ChannelBookingPrevious {
  room_type_id?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
}

export interface ChannelBookingSyncRequest {
  booking_id: string;
  change?: ChannelBookingChange;
  previous?: ChannelBookingPrevious | null;
  /** Cancellation reason, used for reject/cancel verbs. */
  reason?: string | null;
  /** 1 = property provider (default), 2 = guest. */
  cancel_type_id?: number | null;
  /** Skip the availability/rates delta (the caller already queued it). */
  skip_ari?: boolean;
}

export interface ChannelBookingSyncResult {
  reservation: 'pushed' | 'queued' | 'skipped' | 'failed';
  reservation_method?: string | null;
  reservation_reason?: string | null;
  code?: string | null;
  message?: string | null;
  ari: 'queued' | 'skipped' | 'failed';
  ari_reason?: string | null;
  deferred: boolean;
}

/**
 * The listing the channel believes the reservation sits on. Reservations ingested before we stored
 * it (and any record whose mapping was rewritten locally) have to ask the channel, otherwise a
 * modification is sent with a `Current` listing the channel rejects outright.
 */
async function resolveCurrentListing(
  supabase: Db,
  row: Record<string, unknown>,
): Promise<string | null> {
  const stored = row.channel_listing_id as string | null;
  if (stored) return stored;

  const reservationId = String(row.external_reservation_id ?? '');
  if (!reservationId) return null;

  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action: 'get_reservation_by_id',
        reservation_id: reservationId,
        property_id: row.property_id ?? null,
        deferrable: true,
      },
    });
    if (error) return null;
    const listing = data?.reservation?.ruPropertyId;
    if (!listing) return null;
    await supabase
      .from('bookings')
      .update({ channel_listing_id: String(listing) })
      .eq('id', String(row.id));
    return String(listing);
  } catch (_err) {
    return null;
  }
}

/** The channel has no such reservation — retrying can never make it appear. */
function isAbsentAtChannel(message?: string | null): boolean {
  return /reservation does not exist|no such reservation/i.test(String(message ?? ''));
}

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'no_show', 'rejected', 'declined']);

/** Changes that carry no information the channel's reservation record holds. */
const RESERVATION_IRRELEVANT: ChannelBookingChange[] = ['notes'];

function guestCount(row: Record<string, unknown>): number | null {
  const total = (Number(row.adults ?? 0) || 0) + (Number(row.children ?? 0) || 0) +
    (Number(row.teens ?? 0) || 0);
  return total > 0 ? total : null;
}

export async function syncBookingToChannel(
  supabase: Db,
  request: ChannelBookingSyncRequest,
): Promise<ChannelBookingSyncResult> {
  const change: ChannelBookingChange = request.change ?? 'unknown';
  const result: ChannelBookingSyncResult = { reservation: 'skipped', ari: 'skipped', deferred: false };

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, property_id, room_type_id, status, payment_status, check_in_date, check_out_date, ' +
        'adults, children, teens, infants, total_price, deposit_amount, amount_paid, ' +
        'special_requests, booking_channel, integration_type, external_reservation_id, ' +
        'channel_listing_id, cancellation_reason',
    )
    .eq('id', request.booking_id)
    .maybeSingle();

  if (error || !booking) {
    result.reservation = 'skipped';
    result.reservation_reason = error?.message ?? 'booking_not_found';
    result.ari_reason = 'booking_not_found';
    return result;
  }

  const row = booking as Record<string, unknown>;
  const propertyId = String(row.property_id ?? '');
  const status = String(row.status ?? '').toLowerCase();
  const cancelled = change === 'cancelled' || change === 'deleted' || CANCELLED_STATUSES.has(status);

  // ── 1. Reservation-level push (channel-sourced bookings only) ──
  if (!isRuBooking(row)) {
    result.reservation = 'skipped';
    result.reservation_reason = 'not_a_channel_booking';
  } else if (RESERVATION_IRRELEVANT.includes(change)) {
    result.reservation = 'skipped';
    result.reservation_reason = 'change_not_carried_by_channel';
  } else if (cancelled) {
    const push = await cancelRuReservation(supabase, row as never, {
      reason: String(request.reason ?? row.cancellation_reason ?? 'Cancelled in ROL\'OS'),
      cancelTypeId: request.cancel_type_id ?? undefined,
    });
    result.reservation_method = push.method ?? null;
    if (push.ok) {
      result.reservation = push.deferred ? 'queued' : 'pushed';
      result.deferred = result.deferred || push.deferred === true;
    } else if (isAbsentAtChannel(push.message)) {
      result.reservation = 'skipped';
      result.reservation_reason = 'reservation_absent_at_channel';
      result.message = push.message ?? null;
    } else {
      result.reservation = 'failed';
      result.code = push.code ?? null;
      result.message = push.message ?? null;
    }
  } else if (isRuLead(row)) {
    // An unconfirmed request cannot be modified at the channel — it is accepted or rejected.
    result.reservation = 'skipped';
    result.reservation_reason = 'unconfirmed_request';
  } else {
    const push = await modifyRuStay(
      supabase,
      row as never,
      {
        date_from: String(row.check_in_date ?? '') || null,
        date_to: String(row.check_out_date ?? '') || null,
        number_of_guests: guestCount(row),
        client_price: row.total_price != null ? Number(row.total_price) : null,
        already_paid: row.amount_paid != null ? Number(row.amount_paid) : null,
      },
      {
        room_type_id: request.previous?.room_type_id ?? null,
        // The listing recorded at ingestion is what the channel holds; the local unit mapping may
        // already have been rewritten by the move we are pushing.
        ru_property_id: await resolveCurrentListing(supabase, row),
        date_from: request.previous?.check_in_date ?? null,
        date_to: request.previous?.check_out_date ?? null,
      },
    );
    result.reservation_method = push.method ?? null;
    if (push.ok) {
      result.reservation = push.deferred ? 'queued' : 'pushed';
      result.deferred = result.deferred || push.deferred === true;
    } else if (isAbsentAtChannel(push.message)) {
      result.reservation = 'skipped';
      result.reservation_reason = 'reservation_absent_at_channel';
      result.message = push.message ?? null;
    } else {
      result.reservation = 'failed';
      result.code = push.code ?? null;
      result.message = push.message ?? null;
    }

    // A delivered move means the channel now holds the new listing; keep our record of "current"
    // in step so the next modification does not aim at the listing the stay left.
    if (push.ok && !push.deferred) {
      const landed = await resolveRuPropertyId(supabase, row as never);
      if (landed && landed !== row.channel_listing_id) {
        await supabase.from('bookings').update({ channel_listing_id: landed }).eq('id', String(row.id));
      }
    }
  }

  // ── 2. Availability + rates delta (every booking change, local or channel-sourced) ──
  if (request.skip_ari) {
    result.ari = 'skipped';
    result.ari_reason = 'caller_handled';
  } else if (!propertyId) {
    result.ari = 'skipped';
    result.ari_reason = 'no_property';
  } else {
    try {
      const outcome = await queueRuAriDelta(supabase, propertyId, `booking_${change}`, { force: true });
      if (outcome?.error) {
        result.ari = 'failed';
        result.ari_reason = String(outcome.error);
      } else {
        result.ari = 'queued';
        result.ari_reason = outcome?.reason ? String(outcome.reason) : null;
      }
    } catch (err) {
      result.ari = 'failed';
      result.ari_reason = err instanceof Error ? err.message : 'ari_delta_error';
    }
  }

  // ── 3. Bookkeeping so the booking drawer can show what the channel knows ──
  if (result.reservation !== 'skipped') {
    try {
      await supabase.from('booking_sync_status').upsert(
        {
          booking_id: String(row.id),
          external_system: 'rentalsunited',
          sync_status: result.reservation === 'failed'
            ? 'failed'
            : result.reservation === 'queued'
              ? 'pending'
              : 'synced',
          last_action: cancelled ? 'cancel' : 'modify',
          last_action_at: new Date().toISOString(),
          error_message: result.reservation === 'failed' ? result.message ?? null : null,
          last_error_message: result.reservation === 'failed' ? result.message ?? null : null,
        },
        { onConflict: 'booking_id,external_system' },
      );
    } catch (_e) {
      // Bookkeeping must never break the sync outcome.
    }
  }

  return result;
}
