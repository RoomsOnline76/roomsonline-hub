import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  extractAllBlocks,
  parseRuReservation,
  resolveRuUnit,
} from '../_shared/ruReservationParsing.ts';
import { ingestRuReservation } from '../_shared/ruReservationIngest.ts';

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

type NotificationKind = 'reservation_confirmed' | 'reservation_cancelled' | 'reservation_request';

/** Classify from the RU envelope name first, then the reservation status id. */
function classify(rawXml: string, statusId: string | null): NotificationKind {
  const lower = rawXml.toLowerCase();
  if (lower.includes('putcancel') || lower.includes('<iscancel>true</iscancel>') || statusId === '4') {
    return 'reservation_cancelled';
  }
  if (lower.includes('unconfirmed') || lower.includes('lead') || lower.includes('<islead>true</islead>')) {
    return 'reservation_request';
  }
  if (statusId === '1' || statusId === '2') return 'reservation_confirmed';
  return 'reservation_confirmed';
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

    const blocks = extractAllBlocks(rawXml, 'Reservation');
    const parsedBlocks = (blocks.length ? blocks : [rawXml]).map((b) => parseRuReservation(b));

    let needsReconcile = false;

    for (const r of parsedBlocks) {
      const kind = classify(rawXml, r.statusId);
      const unit = await resolveRuUnit(supabase, r.ruPropertyId);
      const propertyId = unit.propertyId;

      const { data: notification } = await supabase
        .from('ru_notifications')
        .insert({
          event_type: kind,
          ru_reservation_id: r.ruReservationId,
          ru_property_id: r.ruPropertyId,
          property_id: propertyId,
          raw_xml: rawXml.slice(0, 20000),
          processed: false,
        })
        .select('id')
        .maybeSingle();
      const notificationId = notification?.id as string | undefined;

      // RU sometimes notifies with an empty <StayInfos /> — nothing to write yet.
      if (!propertyId || !r.dateFrom || !r.dateTo) {
        console.warn(
          `[ru-reservation-handler] Incomplete notification (reservation ${r.ruReservationId}, RU property ${r.ruPropertyId || 'none'}) — queued for reconciliation pull`,
        );
        needsReconcile = true;
        continue;
      }

      const result = await ingestRuReservation(supabase, r, {
        source: 'rlnm',
        logPrefix: '[ru-reservation-handler]',
        forceRequest: kind === 'reservation_request',
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
