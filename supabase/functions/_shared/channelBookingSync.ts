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
  confirmRuRequest,
  isRuBooking,
  isRuLead,
  modifyRuStay,
  pushRuConfirmedReservation,
  resolveRuPropertyId,
} from './ruBookingSync.ts';
import { isTerminalChannelRefusal } from './ruReservationOpClaim.ts';
import {
  resolveRuReservationIdentity,
  type RuReservationIdentity,
} from './ruReservationIdentity.ts';


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
  | 'confirmed'
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
  /** Skip the reservation verb (the caller already delivered it synchronously). */
  skip_reservation?: boolean;
  /** Extra units the change touches (multi-room stays, partial cancels). */
  only_unit_ids?: string[] | null;
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
  /** What the availability/rates write was narrowed to — proof it was not a whole-property push. */
  ari_scope?: { unit_ids: string[]; date_from: string | null; date_to: string | null } | null;
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

/**
 * Endings that must not be recorded as a failure, because a retry cannot change them:
 *  - the write was already delivered (or is in flight) under the claim ledger;
 *  - the channel refuses this content permanently (dates it will not sell, listing it does not have).
 * Recording these as failures is what kept the background job re-sending the same message every
 * minute and filling the traffic monitor with identical red rows.
 */
function nonRetryableSkip(push: { code?: string | null; message?: string | null }):
  | { reason: string }
  | null {
  const code = String(push.code ?? '');
  if (code === 'RU_ALREADY_SENT') return { reason: 'identical_channel_write_already_sent' };
  if (isTerminalChannelRefusal(push.message, code)) return { reason: 'channel_refused_permanently' };
  return null;
}

/** The channel has no such reservation — retrying can never make it appear. */
function isAbsentAtChannel(message?: string | null): boolean {
  return /reservation does not exist|no such reservation/i.test(String(message ?? ''));
}

/** Local statuses that mean "this stay is going ahead" — enough to accept a held request. */
const CONFIRMING_STATUSES = new Set(['checked_in', 'in_house', 'checked_out', 'confirmed', 'guaranteed']);

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'no_show', 'rejected', 'declined']);

/**
 * Stays whose life at the channel is over. Accepting a held request for one of these can never
 * succeed — the channel refuses the reservation's own (now closed) nights — so it must never be
 * attempted, otherwise the 30-minute reservations poll regenerates the same refusal forever.
 */
const CLOSED_STAY_STATUSES = new Set([
  'checked_out',
  'departed',
  'completed',
  'cancelled',
  'canceled',
  'no_show',
  'noshow',
  'rejected',
  'declined',
]);

/** In-house stays get exactly one acceptance attempt; after that they are left alone. */
const IN_HOUSE_STATUSES = new Set(['checked_in', 'in_house']);

/** Has this reservation already been through an acceptance attempt at the channel? */
async function confirmAlreadyAttempted(
  supabase: Db,
  propertyId: string,
  reservationId: string,
): Promise<boolean> {
  if (!reservationId) return false;
  try {
    // Scoped to THIS reservation: the attempt trail lives on ru_api_log, and the reservation id
    // is only carried inside the request envelope. A previous acceptance on a different stay at
    // the same property must never suppress this one.
    const { data } = await supabase
      .from('ru_api_log')
      .select('id')
      .eq('property_id', propertyId)
      .in('parent_action', ['ruBookingSync:confirm', 'ruBookingSync:confirm:reopen'])
      .ilike('request_xml', `%<ReservationID>${reservationId}</ReservationID>%`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch (_err) {
    return false;
  }
}


/** Changes that carry no information the channel's reservation record holds. */
const RESERVATION_IRRELEVANT: ChannelBookingChange[] = ['notes', 'deposit'];

/**
 * Changes that cannot move a single night or price at the channel. Check-in, check-out, a note or
 * a payment leaves the sold nights exactly as they were, so pushing availability and prices for
 * them only burns the owner's rate window — and it was doing so several times per stay.
 */
const ARI_IRRELEVANT = new Set<ChannelBookingChange>(['notes', 'deposit', 'payment', 'status']);

/**
 * Every unit the stay occupies — the booking's own unit, the unit it came from (a move must reopen
 * what it left) and every room line, so a multi-room stay scopes to all of its units instead of
 * only the header one. An empty result means "unknown", and the caller falls back to the property.
 */
async function resolveAffectedUnitIds(
  supabase: Db,
  request: ChannelBookingSyncRequest,
  row: Record<string, unknown>,
): Promise<string[]> {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id) ids.add(id);
  };

  add(row.room_type_id);
  add(request.previous?.room_type_id ?? null);
  for (const id of request.only_unit_ids ?? []) add(id);

  try {
    const { data } = await supabase
      .from('rolos_booking_rooms')
      .select('room_type_id')
      .eq('booking_id', String(row.id));
    for (const line of (data ?? []) as { room_type_id?: string | null }[]) add(line.room_type_id);
  } catch (_err) {
    // Line lookup is an enrichment: the header unit is still a valid scope on its own.
  }

  return [...ids];
}

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

  /**
   * Does this stay already exist at the channel? A booking row can have lost the channel's
   * ReservationID (ingested before we stored it, or a registration that only settled inside the
   * rate-limit queue). Answering "no" from the local column alone is what turned extensions into
   * second registrations, so identity is resolved from evidence before a verb is chosen.
   */
  let identity: RuReservationIdentity | null = null;
  if (!request.skip_reservation && !cancelled && !RESERVATION_IRRELEVANT.includes(change) && !isRuBooking(row)) {
    identity = await resolveRuReservationIdentity(supabase, row as never);
    if (identity.reservationId) {
      row.external_reservation_id = identity.reservationId;
      if (identity.listing) row.channel_listing_id = identity.listing;
    }
  }
  const hasChannelIdentity = isRuBooking(row) || !!identity?.reservationId;

  // ── 1. Reservation-level push ──
  // A stay created in ROL'OS has no reservation at the channel yet. Leaving it that way is what let
  // the channel keep selling nights we had already sold, so an active local stay on a listed unit is
  // handed over as a confirmed reservation and then follows the normal modify/cancel path.
  if (request.skip_reservation) {
    result.reservation = 'skipped';
    result.reservation_reason = 'caller_handled';
  } else if (!hasChannelIdentity) {
    if (cancelled) {
      result.reservation = 'skipped';
      result.reservation_reason = 'no_channel_reservation_to_cancel';
    } else if (RESERVATION_IRRELEVANT.includes(change)) {
      result.reservation = 'skipped';
      result.reservation_reason = 'change_not_carried_by_channel';
    } else if (identity?.pendingCreate) {
      // A first registration is still parked for the next channel slot. Sending another one would
      // duplicate the reservation, so this change waits for that identity instead.
      result.reservation = 'queued';
      result.deferred = true;
      result.reservation_reason = 'channel_registration_pending';
      result.message =
        'The stay is still being registered at the channel — this change follows once that lands.';
    } else if (identity?.absent && change !== 'created') {
      result.reservation = 'skipped';
      result.reservation_reason = 'reservation_absent_at_channel';
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
      } else if (push.queued === true) {
        // Nights reopened and the registration parked for the next channel slot — in flight, not a fault.
        result.reservation = 'queued';
        result.deferred = true;
        result.reservation_reason = 'channel_registration_pending';
        result.message = push.message ?? null;
      } else if (push.code === 'RU_ALREADY_REGISTERED') {
        // The registration guard caught a stay the channel already holds — nothing to report.
        result.reservation = 'skipped';
        result.reservation_reason = 'reservation_already_at_channel';
        result.message = push.message ?? null;
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
        const skip = nonRetryableSkip(push);
        result.reservation = skip ? 'skipped' : 'failed';
        if (skip) result.reservation_reason = skip.reason;
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
      const skip = nonRetryableSkip(push);
      result.reservation = skip ? 'skipped' : 'failed';
      if (skip) result.reservation_reason = skip.reason;
      result.code = push.code ?? null;
      result.message = push.message ?? null;
    }
  } else if (isRuLead(row)) {
    // A held request cannot be modified — it is accepted or rejected. Checking a guest in (or
    // confirming the stay) is the operator saying "this stay is happening", so accept the request
    // at the channel now; otherwise the channel keeps the stay as a pending request forever.
    const reservationId = String(row.external_reservation_id ?? '').trim();
    const closed = CLOSED_STAY_STATUSES.has(status);
    const exhausted = !closed && IN_HOUSE_STATUSES.has(status) &&
      (await confirmAlreadyAttempted(supabase, propertyId, reservationId));

    if (closed || exhausted) {
      // Never retry an acceptance that cannot land: the reservation's own nights are held by the
      // stay itself, so the channel will refuse it every time. This is a non-event, not a failure.
      result.reservation = 'skipped';
      result.reservation_reason = `stay_already_${status || 'closed'}`;
      result.message = closed
        ? 'The stay is closed in ROL\u2019OS — the channel request was not re-sent.'
        : 'The stay is already in-house and the channel acceptance was attempted before — not re-sent.';
    } else if (change === 'confirmed' || CONFIRMING_STATUSES.has(status)) {

      const push = await confirmRuRequest(supabase, row as never, {
        comments: 'Accepted on check-in in ROL\u2019OS',
      });
      result.reservation_method = push.method ?? 'Push_ConfirmRequest_RQ';
      traceId = push.traceId ?? null;
      if (push.ok) {
        result.reservation = push.deferred ? 'queued' : 'pushed';
        result.deferred = result.deferred || push.deferred === true;
        if (!push.deferred) {
          await supabase
            .from('bookings')
            .update({ integration_type: 'rentalsunited' })
            .eq('id', String(row.id));
        }
      } else if (push.queued === true || push.code === 'RU_RATE_DEFERRED') {
        // A parked acceptance is work in flight, not a refusal. Leave the booking as a request
        // until the drainer records delivery, but give the drawer a truthful pending state now.
        result.reservation = 'queued';
        result.deferred = true;
        result.reservation_reason = push.code === 'RU_CONFIRM_QUEUED'
          ? 'channel_acceptance_pending'
          : 'channel_rate_limit';
        result.message = push.message ?? null;
      } else if (push.code === 'RU_AUTH_UNAVAILABLE' || push.code === 'RU_RESERVATION_UNKNOWN') {
        result.reservation = 'skipped';
        result.reservation_reason = push.code === 'RU_AUTH_UNAVAILABLE'
          ? 'no_channel_credentials'
          : 'no_channel_reservation';
        result.message = push.message ?? null;

      } else {
        const skip = nonRetryableSkip(push);
        result.reservation = skip ? 'skipped' : 'failed';
        if (skip) result.reservation_reason = skip.reason;
        result.code = push.code ?? null;
        result.message = push.message ?? null;
      }
    } else {
      result.reservation = 'skipped';
      result.reservation_reason = 'unconfirmed_request';
    }

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
      } else if (push.queued === true) {
        result.reservation = 'queued';
        result.deferred = true;
        result.reservation_reason = 'channel_acceptance_pending';
        result.message = push.message ?? null;
      } else if (push.code === 'RU_RESERVATION_ABSENT' || isAbsentAtChannel(push.message)) {
        result.reservation = 'skipped';
        result.reservation_reason = 'reservation_absent_at_channel';
        result.message = push.message ?? null;
      } else if (push.code === 'RU_RESERVATION_UNRESOLVED') {
        // Deliberately not a create: the stay needs reconciling with the channel portal first.
        result.reservation = 'skipped';
        result.reservation_reason = 'channel_identity_unresolved';
        result.code = push.code;
        result.message = push.message ?? null;

      } else {
        const skip = nonRetryableSkip(push);
        result.reservation = skip ? 'skipped' : 'failed';
        if (skip) result.reservation_reason = skip.reason;
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

  // ── 2. Availability + rates delta — only for changes the channel's calendar can see ──
  if (request.skip_ari) {
    result.ari = 'skipped';
    result.ari_reason = 'caller_handled';
  } else if (!propertyId) {
    result.ari = 'skipped';
    result.ari_reason = 'no_property';
  } else if (ARI_IRRELEVANT.has(change)) {
    // Notes, money and check-in/out moves change nothing the channel sells. Re-pushing
    // availability and prices for them was pure noise against the owner's rate window.
    result.ari = 'skipped';
    result.ari_reason = 'change_does_not_move_inventory';
  } else if (result.reservation === 'queued' || result.deferred) {
    /**
     * A reservation write is still owed to the channel. Publishing the sold nights as 0 units now is
     * exactly what makes the channel refuse that write ("Property is not available for a given
     * dates"), so the calendar is left alone: the channel closes the nights itself the moment the
     * reservation registers, and the next delta re-states the truth.
     */
    result.ari = 'skipped';
    result.ari_reason = 'reservation_pending_at_channel';
  } else {

    try {
      // Scope the write to the nights the stay touches (old span included, so a moved booking
      // reopens what it left) and to the booked unit(s), instead of re-sending the whole year.
      const spanDates = [
        String(row.check_in_date ?? ''),
        String(row.check_out_date ?? ''),
        String(request.previous?.check_in_date ?? ''),
        String(request.previous?.check_out_date ?? ''),
      ].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      const bookedUnitIds = await resolveAffectedUnitIds(supabase, request, row);
      const outcome = await queueRuAriDelta(supabase, propertyId, `booking_${change}`, {
        force: true,
        dateFrom: spanDates[0] ?? null,
        dateTo: spanDates[spanDates.length - 1] ?? null,
        onlyUnitIds: bookedUnitIds.length > 0 ? bookedUnitIds : null,
        // A booking is the one case where the channel calendar must be read back: the sold
        // nights have to be proven closed. Restriction/rate/cron writes skip the pull.
        verifyAvailabilityReadback: true,
      });
      result.ari_scope = {
        unit_ids: bookedUnitIds,
        date_from: spanDates[0] ?? null,
        date_to: spanDates[spanDates.length - 1] ?? null,
      };


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
      ari_scope: result.ari_scope ?? null,

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
