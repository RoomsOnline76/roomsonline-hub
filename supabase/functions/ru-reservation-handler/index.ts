import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  classifyRuNotificationBlock,
  extractAllBlocks,
  parseRuReservation,
  resolveRuUnit,
  type RuNotificationKind,
} from '../_shared/ruReservationParsing.ts';

import { ingestRuReservation, refreshRuReservationById } from '../_shared/ruReservationIngest.ts';
import { scheduleRuNotificationRetry, sweepRuNotificationRetries } from '../_shared/ruNotificationRetry.ts';
import { logRuInboundNotification, newRuTraceId } from '../_shared/ruApiLog.ts';
import { recordChannelBookingEvent, type BookingEventAction, type BookingEventOutcome } from '../_shared/channelBookingEvents.ts';
import { findRuOwnPushEcho } from '../_shared/ruOwnPushEcho.ts';


/**
 * RU Reservation Live Notification Mechanism (RLNM) Handler
 *
 * Receives POST XML from Rentals United for:
 * - Confirmed reservations  → creates/updates a confirmed booking + blocks the nights
 * - Unconfirmed reservations (leads) → creates a `pending` hold booking (3-day hold)
 * - Cancelled reservations  → cancels the booking and releases the nights
 *
 * All writes go through the shared `ingestRuReservation` helper, which is also used by
 * `cron-pull-ru-reservations`. That makes the notification path and the polling path
 * byte-for-byte identical and idempotent: replaying the same notification, or a
 * notification racing a poll, converges on an update instead of a duplicate booking.
 *
 * When RU sends an envelope with an empty <StayInfos /> (no dates or PropertyID), the
 * notification is logged and a reconciliation pull is triggered instead of writing a
 * half-populated booking.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NotificationEvent =
  | 'reservation_confirmed'
  | 'reservation_modified'
  | 'reservation_cancelled'
  | 'reservation_request';

/** The trail's action vocabulary for an inbound notification. */
const TRAIL_ACTION_BY_KIND: Record<RuNotificationKind, BookingEventAction> = {
  confirmed: 'confirmed',
  modified: 'modified',
  cancelled: 'cancelled',
  request: 'request',
};

const RU_VERB_BY_KIND: Record<RuNotificationKind, string> = {
  confirmed: 'RLNM_ReservationConfirmed',
  modified: 'RLNM_ReservationModified',
  cancelled: 'RLNM_ReservationCancelled',
  request: 'RLNM_ReservationRequest',
};

const EVENT_BY_KIND: Record<RuNotificationKind, NotificationEvent> = {
  confirmed: 'reservation_confirmed',
  modified: 'reservation_modified',
  cancelled: 'reservation_cancelled',
  request: 'reservation_request',
};

/**
 * The channel routinely notifies a second or two BEFORE it will serve the reservation, so the
 * first detail pull misses. Retrying on this fast ladder in the background — after the channel
 * already has its OK — lands a normal request in seconds instead of waiting for the
 * minute-scale parked sweep.
 */
const FAST_RETRY_DELAYS_MS = [5_000, 15_000, 40_000];

/**
 * The channel's sliding minute is keyed on method + parameters. After a -6 refusal the only
 * useful move is to come back once that minute has closed — done here, in the background, so
 * the stay paints ~a minute after the callback instead of waiting for the minute-scale cron
 * sweep to pick the parked row up (which added up to another 60s).
 */
const RATE_DEFERRED_RETRY_MS = 65_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * RU frequently posts the same RLNM callback twice within a second. Both copies used to fire
 * their own `Pull_GetReservationByID_RQ`, and the second one spent the per-method minute — so
 * the duplicate was the direct cause of the -6 that parked the booking for over a minute.
 * The later copy is recorded and dropped: the first is already resolving it.
 */
async function findInFlightSibling(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  reservationId: string | null,
  notificationId: string | undefined,
): Promise<string | null> {
  if (!reservationId) return null;
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data } = await supabase
    .from('ru_notifications')
    .select('id, created_at, resolution_state')
    .eq('ru_reservation_id', reservationId)
    .gte('created_at', since)
    .in('resolution_state', ['pending', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(5);
  const rows = (data || []) as { id: string; resolution_state: string }[];
  const leader = rows.find((row) => row.id !== notificationId);
  return leader?.id ?? null;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ok = () =>
    new Response('<Response>OK</Response>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const rawXml = await req.text();
    console.log(`[ru-reservation-handler] Received notification (${rawXml.length} bytes)`);
    if (!rawXml || rawXml.length < 10) {
      console.warn('[ru-reservation-handler] Empty or invalid body');
      return ok();
    }

    // ── Operator retry path: JSON body { notification_id? , reservation_id? } re-runs the
    // detail pull + ingest for a single stuck notification (see the Reservations panel).
    if (rawXml.trimStart().startsWith('{')) {
      const body = JSON.parse(rawXml) as { notification_id?: string; reservation_id?: string; sweep?: boolean };
      // Timed sweep of parked notifications (called by the reservation cron).
      if (body.sweep) {
        const sweep = await sweepRuNotificationRetries(supabase, { logPrefix: '[ru-reservation-handler][sweep]' });
        return new Response(JSON.stringify({ success: true, sweep }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let reservationId = body.reservation_id ?? null;
      let propertyId: string | null = null;
      if (body.notification_id) {
        const { data: row } = await supabase
          .from('ru_notifications')
          .select('ru_reservation_id, property_id')
          .eq('id', body.notification_id)
          .maybeSingle();
        reservationId = reservationId ?? (row?.ru_reservation_id ? String(row.ru_reservation_id) : null);
        propertyId = row?.property_id ?? null;
      }
      if (!reservationId) {
        return new Response(JSON.stringify({ success: false, error: 'No reservation id to retry' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const retried = await refreshRuReservationById(supabase, reservationId, {
        propertyId,
        logPrefix: '[ru-reservation-handler][retry]',
      });
      const resolved = retried.outcome !== 'failed' && retried.outcome !== 'unmatched';
      if (body.notification_id) {
        await supabase
          .from('ru_notifications')
          .update({
            processed: resolved,
            resolution_state: resolved ? 'resolved' : 'retrying',
            error_message: resolved ? null : retried.error ?? `Ingest outcome: ${retried.outcome}`,
            next_attempt_at: resolved ? null : new Date(Date.now() + 60_000).toISOString(),
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', body.notification_id);
      }
      return new Response(
        JSON.stringify({ success: resolved, outcome: retried.outcome, booking_id: retried.bookingId, error: retried.error ?? null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }



    // Keep each block's own XML: a multi-reservation envelope can mix confirmations and
    // cancellations, so classification has to happen per block (falling back to the envelope).
    const blocks = extractAllBlocks(rawXml, 'Reservation');
    const parsedBlocks = (blocks.length ? blocks : [rawXml]).map((b) => ({
      raw: b,
      parsed: parseRuReservation(b),
    }));

    let needsReconcile = false;

    for (const { raw, parsed: r } of parsedBlocks) {
      // Envelope intent always wins: an inner <Reservation> block carries no envelope name,
      // so a lead's StatusID 4 would otherwise read as a cancellation.
      const kind: RuNotificationKind = classifyRuNotificationBlock(rawXml, raw, r.statusId);
      const eventType = EVENT_BY_KIND[kind];
      const unit = await resolveRuUnit(supabase, r.ruPropertyId);
      const propertyId = unit.propertyId;
      const unmappedListing = !!r.ruPropertyId && !propertyId;

      const { data: notification } = await supabase
        .from('ru_notifications')
        .insert({
          event_type: eventType,
          ru_reservation_id: r.ruReservationId,
          ru_property_id: r.ruPropertyId,
          property_id: propertyId,
          raw_xml: rawXml.slice(0, 20000),
          processed: false,
          resolution_state: unmappedListing ? 'unmapped' : 'pending',
          error_message: unmappedListing
            ? `Channel listing ${r.ruPropertyId} is not mapped to any ROL'OS unit`
            : null,
          last_attempt_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();
      const notificationId = notification?.id as string | undefined;

      // Both directions now land in the exchange log: this is the exact body the channel posted.
      const traceId = newRuTraceId();
      await logRuInboundNotification(supabase, {
        trace_id: traceId,
        parent_action: `ru-reservation-handler:${kind}`,
        action: RU_VERB_BY_KIND[kind],
        property_id: propertyId,
        unit_id: unit.roomTypeId ?? null,
        ru_property_id: r.ruPropertyId ?? null,
        body_xml: raw,
        success: !unmappedListing,
        error_reason: unmappedListing
          ? `unmapped_listing: channel listing ${r.ruPropertyId} is not mapped to any ROL'OS unit`
          : null,
      });

      const trail = (outcome: BookingEventOutcome, reason: string | null, summary: string, bookingId?: string | null) =>
        recordChannelBookingEvent(supabase, {
          booking_id: bookingId ?? null,
          property_id: propertyId,
          unit_id: unit.roomTypeId ?? null,
          direction: 'inbound',
          action: TRAIL_ACTION_BY_KIND[kind],
          source: 'rlnm',
          outcome,
          reason,
          channel_reservation_id: r.ruReservationId ?? null,
          channel_listing_id: r.ruPropertyId ?? null,
          trace_id: traceId,
          summary,
          details: { kind, event_type: eventType, date_from: r.dateFrom ?? null, date_to: r.dateTo ?? null },
        });

      const markResolved = async (state: 'resolved' | 'failed' | 'unmapped', error: string | null, ownerId?: string | null) => {
        if (!notificationId) return;
        await supabase
          .from('ru_notifications')
          .update({
            processed: state === 'resolved',
            resolution_state: state,
            error_message: error,
            resolved_owner_id: ownerId ?? null,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', notificationId);
      };

      // Our own registration echoing back: RU notifies about the reservation ROL'OS just
      // created. Ingesting it would rewrite the booking (firing a pointless ModifyStay) and,
      // for the stay-less `request` echo, fan a detail pull across every account until the
      // channel answers -6. Record the evidence and stop.
      const echo = await findRuOwnPushEcho(supabase, r.ruReservationId);
      if (echo) {
        console.log(
          `[ru-reservation-handler] Reservation ${r.ruReservationId} is our own push (booking ${echo.bookingId} at ${echo.pushedAt}) — echo suppressed`,
        );
        await markResolved('resolved', null);
        await trail('skipped', 'own_push_echo', 'Echo of our own reservation push — not re-ingested', echo.bookingId);
        continue;
      }

      // RU sometimes notifies with an empty <StayInfos /> — pull that one reservation by id
      // (Pull_GetReservationByID_RQ) instead of reconciling the whole account window. The
      // lookup fans out across every distribution account, since the envelope rarely says
      // which one owns the reservation.
      if (!propertyId || !r.dateFrom || !r.dateTo) {

        // A sibling callback for the same reservation is already resolving: a second detail
        // pull would only spend the channel's per-method minute and stall both of them.
        const sibling = await findInFlightSibling(supabase, r.ruReservationId, notificationId);
        if (sibling) {
          console.log(
            `[ru-reservation-handler] Duplicate callback for reservation ${r.ruReservationId} — detail pull already in flight (${sibling})`,
          );
          await markResolved('resolved', null);
          await trail('skipped', 'duplicate_callback', 'Duplicate channel callback — detail pull already in flight');
          continue;
        }

        if (r.ruReservationId) {
          const refreshed = await refreshRuReservationById(supabase, r.ruReservationId, {
            propertyId,
            logPrefix: '[ru-reservation-handler][detail]',
            forceRequest: kind === 'request',
            kind,
            creator: r.creator,
          });
          if (refreshed.outcome !== 'failed' && refreshed.outcome !== 'unmatched') {
            await markResolved('resolved', null, refreshed.resolvedOwnerId ?? null);
            await trail('ingested', 'detail_pull', 'Channel notification resolved via detail pull', refreshed.bookingId ?? null);
            continue;
          }
          // The channel usually starts serving the reservation within seconds. Retry on the
          // fast ladder in the background so the stay lands almost immediately, and only park
          // it for the minute-scale sweep once that ladder is exhausted.
          const reservationId = r.ruReservationId;
          const parkForSweep = async (error: string | null, rateDeferred: boolean, ownerId: string | null) => {
            if (!notificationId) return;
            const state = await scheduleRuNotificationRetry(supabase, notificationId, {
              attemptCount: 0,
              error: error ?? 'Detail pull could not resolve the reservation',
              state: unmappedListing ? 'unmapped' : undefined,
              // A rate-limited read says nothing about whether the reservation exists —
              // it must not consume one of the finite retry attempts.
              freeAttempt: rateDeferred,
              ownerId,
            });
            console.warn(
              `[ru-reservation-handler] Reservation ${reservationId} parked as ${state}: ${error ?? 'detail pull unresolved'}`,
            );
            await trail(
              'queued',
              rateDeferred ? 'rate_deferred' : 'detail_pull_unresolved',
              `Channel notification parked as ${state} — will retry`,
            );
          };

          const fastLadder = async () => {
            let last = refreshed;
            for (const delay of FAST_RETRY_DELAYS_MS) {
              await sleep(delay);
              last = await refreshRuReservationById(supabase, reservationId, {
                propertyId,
                logPrefix: '[ru-reservation-handler][fast-retry]',
                forceRequest: kind === 'request',
                kind,
                creator: r.creator,
              });
              if (last.outcome !== 'failed' && last.outcome !== 'unmatched') {
                await markResolved('resolved', null, last.resolvedOwnerId ?? null);
                await trail(
                  'ingested',
                  'fast_retry',
                  'Channel notification resolved on fast retry',
                  last.bookingId ?? null,
                );
                return;
              }
              // A rate refusal means the channel's sliding minute is still open — every rung
              // of this ladder falls inside it, so replaying only produces more -6 answers.
              if (last.rateDeferred) break;
            }
            await parkForSweep(last.error ?? null, last.rateDeferred === true, last.resolvedOwnerId ?? null);
          };

          if (refreshed.rateDeferred) {
            // Nothing to retry fast: the channel has told us to come back after its minute.
            await parkForSweep(refreshed.error ?? null, true, refreshed.resolvedOwnerId ?? null);
          } else {
            const runLadder = fastLadder().catch((e: unknown) =>
              console.error('[ru-reservation-handler] Fast retry ladder failed:', e),
            );
            // deno-lint-ignore no-explicit-any
            const runtime = (globalThis as any).EdgeRuntime;
            if (runtime?.waitUntil) runtime.waitUntil(runLadder);
            else await runLadder;
          }


        } else {

          await markResolved('failed', 'Notification carried no reservation id');
          await trail('failed', 'no_reservation_id', 'Channel notification carried no reservation id');
        }
        console.warn(
          `[ru-reservation-handler] Incomplete notification (reservation ${r.ruReservationId}, RU property ${r.ruPropertyId || 'none'}) — detail pull retrying in background`,
        );
        // Unmapped upstream listings are a data problem, not something a wider pull fixes, and a
        // reservation with an id is already being retried by the fast ladder.
        if (!unmappedListing && !r.ruReservationId) needsReconcile = true;
        continue;

      }


      const result = await ingestRuReservation(supabase, r, {
        source: 'rlnm',
        logPrefix: '[ru-reservation-handler]',
        forceRequest: kind === 'request',
        kind,
        unit,
      });

      if (result.outcome === 'failed' || result.outcome === 'unmatched') {
        console.error(`[ru-reservation-handler] Ingest failed for ${r.ruReservationId}: ${result.error}`);
        await markResolved('failed', result.error ?? `Ingest outcome: ${result.outcome}`);
        await trail('failed', result.outcome, `Channel notification could not be ingested — ${result.error ?? result.outcome}`);
      } else {
        await markResolved('resolved', null);
        await trail('ingested', result.outcome, `Channel ${kind} reservation ingested`, result.bookingId ?? null);
      }
    }

    // A notification without stay data only tells us "something changed" — pull the
    // full reservation/lead set (account-scoped, correct sub-user credentials) to fill in.
    if (needsReconcile) {
      supabase.functions
        .invoke('cron-pull-ru-reservations', { body: { trigger: 'rlnm_reconcile' } })
        .catch((e: unknown) => console.warn('[ru-reservation-handler] Reconciliation pull failed:', e));
    }


    return ok();
  } catch (error) {
    console.error('[ru-reservation-handler] Error:', error);
    // Still return 200 to prevent RU from retrying endlessly
    return ok();
  }
});
