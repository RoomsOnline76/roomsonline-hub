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
import { bookingActionFromChange, recordChannelBookingEvent } from './channelBookingEvents.ts';
import {
  cancelRuReservation,
  isRuBooking,
  isRuLead,
  modifyRuStay,
  pushRuConfirmedReservation,
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
  | 'deposit'
  | 'payment'
  | 'notes'
  | 'status'
  | 'cancelled'
  | 'no_show'
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
  /** Where the action was triggered — recorded on the diagnostics trail. */
  source?: string | null;
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
): Promise<{ listing: string | null; absent: boolean }> {
  const stored = row.channel_listing_id as string | null;
  if (stored) return { listing: stored, absent: false };

  const reservationId = String(row.external_reservation_id ?? '');
  if (!reservationId) return { listing: null, absent: false };

  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action: 'get_reservation_by_id',
        reservation_id: reservationId,
        property_id: row.property_id ?? null,
        deferrable: true,
      },
    });
    if (error) return { listing: null, absent: false };
    const listing = data?.reservation?.ruPropertyId;
    if (!listing) {
      // The channel answering "reservation does not exist" is a definitive answer: there is
      // nothing to modify, so the push is skipped instead of failing on a mismatched listing.
      const absent = data?.found === false || isAbsentAtChannel(
        typeof data?.raw_xml === 'string' ? data.raw_xml : null,
      );
      return { listing: null, absent };
    }
    await supabase
      .from('bookings')
      .update({ channel_listing_id: String(listing) })
      .eq('id', String(row.id));
    return { listing: String(listing), absent: false };
  } catch (_err) {
    return { listing: null, absent: false };
  }
}

/** The channel has no such reservation — retrying can never make it appear. */
function isAbsentAtChannel(message?: string | null): boolean {
  return /reservation does not exist|no such reservation/i.test(String(message ?? ''));
}

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'no_show', 'rejected', 'declined']);

/** Changes that carry no information the channel's reservation record holds. */
const RESERVATION_IRRELEVANT: ChannelBookingChange[] = ['notes', 'deposit'];

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
        'channel_listing_id, cancellation_reason, guest_first_name, guest_last_name, ' +
        'guest_email, guest_phone',
    )
    .eq('id', request.booking_id)
    .maybeSingle();

  if (error || !booking) {
    result.reservation = 'skipped';
    result.reservation_reason = error?.message ?? 'booking_not_found';
    result.ari_reason = 'booking_not_found';
    await recordChannelBookingEvent(supabase, {
      booking_id: request.booking_id,
      direction: 'outbound',
      action: bookingActionFromChange(change),
      source: request.source ?? 'channel_booking_sync',
      outcome: 'skipped',
      reason: 'booking_not_found',
      summary: 'Booking could not be read — nothing sent to the channel',
      details: { change },
    });
    return result;
  }

  const row = booking as Record<string, unknown>;
  const propertyId = String(row.property_id ?? '');
  const status = String(row.status ?? '').toLowerCase();
  const cancelled = change === 'cancelled' || change === 'no_show' || change === 'deleted' ||
    CANCELLED_STATUSES.has(status);
  let traceId: string | null = null;

  // ── 1. Reservation-level push ──
  // A stay created in ROL'OS has no reservation at the channel yet. Leaving it that way is what let
  // the channel keep selling nights we had already sold, so an active local stay on a listed unit is
  // handed over as a confirmed reservation and then follows the normal modify/cancel path.
  if (!isRuBooking(row)) {
    if (cancelled) {
      result.reservation = 'skipped';
      result.reservation_reason = 'no_channel_reservation_to_cancel';
    } else if (RESERVATION_IRRELEVANT.includes(change)) {
      result.reservation = 'skipped';
      result.reservation_reason = 'change_not_carried_by_channel';
    } else {
      const push = await pushRuConfirmedReservation(supabase, row as never);
      result.reservation_method = push.method ?? null;
      traceId = push.traceId ?? null;
      if (push.ok) {
        result.reservation = push.deferred ? 'queued' : 'pushed';
        result.deferred = result.deferred || push.deferred === true;
        if (push.reservationId) {
          await supabase
            .from('bookings')
            .update({
              external_reservation_id: push.reservationId,
              channel_listing_id: push.ruPropertyId ?? row.channel_listing_id ?? null,
              integration_type: 'rentalsunited',
            })
            .eq('id', String(row.id));
        }
      } else if (
        push.code === 'RU_PROPERTY_UNMAPPED' || push.code === 'RU_AUTH_UNAVAILABLE' ||
        push.code === 'RU_LISTING_MISSING'
      ) {
        // Not a fault: this unit simply is not distributed through the channel.
        result.reservation = 'skipped';
        result.reservation_reason = push.code === 'RU_AUTH_UNAVAILABLE'
          ? 'no_channel_credentials'
          : push.code === 'RU_LISTING_MISSING'
            ? 'listing_missing_at_channel'
            : 'unit_not_listed_on_channel';
        result.message = push.message ?? null;
      } else {
        result.reservation = 'failed';
        result.code = push.code ?? null;
        result.message = push.message ?? null;
      }
    }
  } else if (RESERVATION_IRRELEVANT.includes(change)) {
    result.reservation = 'skipped';
    result.reservation_reason = 'change_not_carried_by_channel';
  } else if (cancelled) {
    const push = await cancelRuReservation(supabase, row as never, {
      reason: String(request.reason ?? row.cancellation_reason ?? 'Cancelled in ROL\'OS'),
      cancelTypeId: request.cancel_type_id ?? undefined,
    });
    result.reservation_method = push.method ?? null;
    traceId = push.traceId ?? null;
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
    const current = await resolveCurrentListing(supabase, row);
    if (current.absent) {
      // The channel has no record of this reservation, so there is nothing to modify. The
      // availability delta below still runs: the nights are ours to close either way.
      result.reservation = 'skipped';
      result.reservation_reason = 'reservation_absent_at_channel';
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
          // The listing recorded at ingestion is what the channel holds; the local unit mapping
          // may already have been rewritten by the move we are pushing.
          ru_property_id: current.listing,
          date_from: request.previous?.check_in_date ?? null,
          date_to: request.previous?.check_out_date ?? null,
        },
      );
      result.reservation_method = push.method ?? null;
      traceId = push.traceId ?? null;
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

      // A delivered move means the channel now holds the new listing; keep our record of
      // "current" in step so the next modification does not aim at the listing the stay left.
      if (push.ok && !push.deferred) {
        const landed = await resolveRuPropertyId(supabase, row as never);
        if (landed && landed !== row.channel_listing_id) {
          await supabase.from('bookings').update({ channel_listing_id: landed }).eq('id', String(row.id));
        }
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

  await recordChannelBookingEvent(supabase, {
    booking_id: String(row.id),
    property_id: propertyId || null,
    unit_id: (row.room_type_id as string | null) ?? null,
    direction: 'outbound',
    action: bookingActionFromChange(change, status),
    source: request.source ?? 'channel_booking_sync',
    outcome: result.reservation === 'pushed'
      ? 'pushed'
      : result.reservation === 'queued'
        ? 'queued'
        : result.reservation === 'failed'
          ? 'failed'
          : 'skipped',
    reason: result.reservation_reason ?? result.code ?? null,
    channel_reservation_id: (row.external_reservation_id as string | null) ?? null,
    channel_listing_id: (row.channel_listing_id as string | null) ?? null,
    trace_id: traceId,
    summary: describeOutcome(change, result),
    details: {
      change,
      reservation: result.reservation,
      reservation_method: result.reservation_method ?? null,
      ari: result.ari,
      ari_reason: result.ari_reason ?? null,
      deferred: result.deferred,
      message: result.message ?? null,
      status,
    },
  });

  return result;
}

/** One human line an operator can read without opening the payload. */
function describeOutcome(change: ChannelBookingChange, result: ChannelBookingSyncResult): string {
  const label = change.replace(/_/g, ' ');
  switch (result.reservation) {
    case 'pushed':
      return `${label}: sent to the channel (${result.reservation_method ?? 'reservation'})`;
    case 'queued':
      return `${label}: rate-limited, parked in the channel queue`;
    case 'failed':
      return `${label}: channel rejected the change — ${result.message ?? result.code ?? 'unknown error'}`;
    default:
      return `${label}: no reservation push (${result.reservation_reason ?? 'not applicable'}); availability ${result.ari}`;
  }
}
