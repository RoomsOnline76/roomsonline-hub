import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadCurrencyState, revertAmount } from '../_shared/ruCurrency.ts';
import {
  applyRuAvailabilityBlock,
  buildRuChannelNotes,
  extractAllBlocks,
  parseRuReservation,
  resolveRuUnit,
  type ParsedRuReservation,
} from '../_shared/ruReservationParsing.ts';

/**
 * RU Reservation Live Notification Mechanism (RLNM) Handler
 *
 * Receives POST XML from Rentals United for:
 * - Confirmed reservations  → creates/updates a confirmed booking + blocks the nights
 * - Unconfirmed reservations (leads) → creates a `pending` hold booking (3-day hold)
 * - Cancelled reservations  → cancels the booking and releases the nights
 *
 * RU nests guest and stay data inside <CustomerInfo> / <StayInfo>; the shared parser is
 * used so the notification path and the polling cron produce identical booking records.
 * When RU sends an envelope with an empty <StayInfos /> (no dates or PropertyID), the
 * notification is logged and a reconciliation pull is triggered instead of writing a
 * half-populated booking.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** How long an unconfirmed RU lead holds the dates before availability is released. */
const LEAD_HOLD_DAYS = 3;

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

      const markProcessed = async () => {
        if (notificationId) await supabase.from('ru_notifications').update({ processed: true }).eq('id', notificationId);
      };

      // RU sometimes notifies with an empty <StayInfos /> — nothing to write yet.
      if (!propertyId || !r.dateFrom || !r.dateTo) {
        console.warn(
          `[ru-reservation-handler] Incomplete notification (reservation ${r.ruReservationId}, RU property ${r.ruPropertyId || 'none'}) — queued for reconciliation pull`,
        );
        needsReconcile = true;
        continue;
      }

      const existingQuery = await supabase
        .from('bookings')
        .select('id, status')
        .eq('external_reservation_id', r.ruReservationId)
        .in('integration_type', ['rentalsunited', 'rentalsunited_lead'])
        .limit(1)
        .maybeSingle();
      const existing = existingQuery.data as { id: string; status: string } | null;

      if (kind === 'reservation_cancelled') {
        if (existing && existing.status !== 'cancelled') {
          await supabase
            .from('bookings')
            .update({ status: 'cancelled', cancellation_reason: 'Cancelled via Rentals United' })
            .eq('id', existing.id);
          await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, false, '[ru-reservation-handler]');
          console.log(`[ru-reservation-handler] ✅ Cancelled booking for RU reservation ${r.ruReservationId}`);
        }
        await markProcessed();
        continue;
      }

      // ── Currency: convert an inbound published amount back to the authored currency. ──
      let bookedAmount = r.total || 0;
      let currencyMeta: Record<string, unknown> | null = null;
      try {
        const ccyState = await loadCurrencyState(supabase, propertyId);
        if (ccyState?.conversion_in_force && Number(ccyState.effective_rate) > 0 && bookedAmount > 0) {
          const original = bookedAmount;
          bookedAmount = revertAmount(original, Number(ccyState.effective_rate));
          currencyMeta = {
            ru_currency_conversion: {
              published_currency: ccyState.published_currency_iso,
              published_amount: original,
              authored_currency: ccyState.authored_currency_iso,
              authored_amount: bookedAmount,
              fx_rate: ccyState.fx_rate,
              margin_pct: ccyState.margin_pct,
              effective_rate: ccyState.effective_rate,
            },
          };
        }
      } catch (e) {
        console.warn('[ru-reservation-handler] Currency state lookup failed:', e instanceof Error ? e.message : e);
      }

      const guestFields: Record<string, unknown> = {
        guest_name: r.guestName,
        guest_email: r.guestEmail,
        guest_phone: r.guestPhone,
        adults: r.numGuests || 1,
        total_price: bookedAmount,
        check_in_date: r.dateFrom,
        check_out_date: r.dateTo,
        modification_notes: buildRuChannelNotes(r, currencyMeta ?? {}),
      };
      if (unit.roomTypeId) guestFields.room_type_id = unit.roomTypeId;
      if (r.comments) guestFields.special_requests = r.comments;

      if (kind === 'reservation_request') {
        const leadCreatedAt = r.createdDate ? new Date(r.createdDate.replace(' ', 'T') + 'Z') : new Date();
        const holdExpiresAt = new Date(leadCreatedAt.getTime() + LEAD_HOLD_DAYS * 86_400_000);

        if (existing) {
          await supabase.from('bookings').update(guestFields).eq('id', existing.id);
        } else {
          const { error: reqErr } = await supabase.from('bookings').insert({
            ...guestFields,
            property_id: propertyId,
            status: 'pending',
            booking_channel: 'rentals_united',
            integration_type: 'rentalsunited_lead',
            external_reservation_id: r.ruReservationId,
            payment_status: 'pending',
            lead_created_at: leadCreatedAt.toISOString(),
            hold_expires_at: holdExpiresAt.toISOString(),
            special_requests:
              `Rentals United request — dates held until ${holdExpiresAt.toISOString().slice(0, 10)}` +
              (r.comments ? ` · ${r.comments}` : ''),
          });
          if (reqErr) {
            console.error(`[ru-reservation-handler] Request insert failed for ${r.ruReservationId}: ${reqErr.message}`);
          } else if (holdExpiresAt.getTime() > Date.now()) {
            await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, '[ru-reservation-handler]');
            console.log(`[ru-reservation-handler] ✅ Held RU request ${r.ruReservationId} until ${holdExpiresAt.toISOString()}`);
          }
        }
        await markProcessed();
        continue;
      }

      // ── Confirmed ──
      const confirmedFields: Record<string, unknown> = {
        ...guestFields,
        status: 'confirmed',
        integration_type: 'rentalsunited',
        hold_expires_at: null,
        hold_released_at: null,
        payment_status: r.alreadyPaid > 0 ? 'paid_externally' : 'pending',
      };
      if (r.alreadyPaid > 0) confirmedFields.paid_at = new Date().toISOString();

      if (existing) {
        await supabase.from('bookings').update(confirmedFields).eq('id', existing.id);
        console.log(`[ru-reservation-handler] ✅ Updated booking for RU reservation ${r.ruReservationId}`);
      } else {
        const { error: bookingErr } = await supabase.from('bookings').insert({
          ...confirmedFields,
          property_id: propertyId,
          booking_channel: 'rentals_united',
          external_reservation_id: r.ruReservationId,
          ...(currencyMeta ? { ai_metadata: currencyMeta } : {}),
        });
        if (bookingErr) console.error(`[ru-reservation-handler] Failed to create booking: ${bookingErr.message}`);
        else console.log(`[ru-reservation-handler] ✅ Booking created for RU reservation ${r.ruReservationId}`);
      }
      await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, '[ru-reservation-handler]');
      await markProcessed();
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
