import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  classifyRuNotification,
  extractAllBlocks,
  parseRuReservation,
  resolveRuUnit,
  type RuNotificationKind,
} from '../_shared/ruReservationParsing.ts';
import { ingestRuReservation, refreshRuReservationById } from '../_shared/ruReservationIngest.ts';

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

const EVENT_BY_KIND: Record<RuNotificationKind, NotificationEvent> = {
  confirmed: 'reservation_confirmed',
  modified: 'reservation_modified',
  cancelled: 'reservation_cancelled',
  request: 'reservation_request',
};

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

    // Keep each block's own XML: a multi-reservation envelope can mix confirmations and
    // cancellations, so classification has to happen per block (falling back to the envelope).
    const blocks = extractAllBlocks(rawXml, 'Reservation');
    const parsedBlocks = (blocks.length ? blocks : [rawXml]).map((b) => ({
      raw: b,
      parsed: parseRuReservation(b),
    }));

    let needsReconcile = false;

    for (const { raw, parsed: r } of parsedBlocks) {
      // Envelope name wins over the numeric status; the block only refines it.
      const envelopeKind = classifyRuNotification(rawXml, null);
      const blockKind = classifyRuNotification(raw, r.statusId);
      const kind: RuNotificationKind =
        envelopeKind === 'cancelled' || envelopeKind === 'modified' ? envelopeKind : blockKind;
      const eventType = EVENT_BY_KIND[kind];
      const unit = await resolveRuUnit(supabase, r.ruPropertyId);
      const propertyId = unit.propertyId;

      const { data: notification } = await supabase
        .from('ru_notifications')
        .insert({
          event_type: eventType,
          ru_reservation_id: r.ruReservationId,
          ru_property_id: r.ruPropertyId,
          property_id: propertyId,
          raw_xml: rawXml.slice(0, 20000),
          processed: false,
        })
        .select('id')
        .maybeSingle();
      const notificationId = notification?.id as string | undefined;

      // RU sometimes notifies with an empty <StayInfos /> — pull that one reservation by id
      // (Pull_GetReservationByID_RQ) instead of reconciling the whole account window.
      if (!propertyId || !r.dateFrom || !r.dateTo) {
        if (r.ruReservationId) {
          const refreshed = await refreshRuReservationById(supabase, r.ruReservationId, {
            propertyId,
            logPrefix: '[ru-reservation-handler][detail]',
            forceRequest: kind === 'request',
            kind,
          });
          if (refreshed.outcome !== 'failed' && refreshed.outcome !== 'unmatched') {
            if (notificationId) {
              await supabase.from('ru_notifications').update({ processed: true }).eq('id', notificationId);
            }
            continue;
          }
        }
        console.warn(
          `[ru-reservation-handler] Incomplete notification (reservation ${r.ruReservationId}, RU property ${r.ruPropertyId || 'none'}) — detail pull unavailable, queued for reconciliation pull`,
        );
        needsReconcile = true;
        continue;
      }


      const result = await ingestRuReservation(supabase, r, {
        source: 'rlnm',
        logPrefix: '[ru-reservation-handler]',
        forceRequest: kind === 'request',
        kind,
        unit,
      });

      if (result.outcome === 'failed') {
        console.error(`[ru-reservation-handler] Ingest failed for ${r.ruReservationId}: ${result.error}`);
      } else if (notificationId) {
        await supabase
          .from('ru_notifications')
          .update({ processed: true })
          .eq('id', notificationId);
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
