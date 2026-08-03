import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadCurrencyState, revertAmount } from '../_shared/ruCurrency.ts';

/**
 * RU Reservation Live Notification Mechanism (RLNM) Handler — Phase 2
 *
 * Receives POST XML from Rentals United for:
 * - Confirmed reservations → creates booking record
 * - Cancelled reservations → cancels existing booking
 * - New leads → logs only
 *
 * Bookings created here are tagged with booking_channel='rentals_united'
 * and integration_type='rentalsunited' for easy identification.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function determineEventType(xml: string): string {
  const lower = xml.toLowerCase();
  if (lower.includes('cancelled') || lower.includes('cancellation') || lower.includes('<iscancel>true</iscancel>')) {
    return 'reservation_cancelled';
  }
  if (lower.includes('lead') || lower.includes('<islead>true</islead>')) {
    return 'lead';
  }
  return 'reservation_confirmed';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const rawXml = await req.text();
    console.log(`[ru-reservation-handler] Received notification (${rawXml.length} bytes)`);

    if (!rawXml || rawXml.length < 10) {
      console.warn('[ru-reservation-handler] Empty or invalid body');
      return new Response('<Response>OK</Response>', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
      });
    }

    // Extract key fields from the XML
    const ruReservationId = extractTag(rawXml, 'ReservationID') || extractTag(rawXml, 'reservationid') || null;
    const ruPropertyId = extractTag(rawXml, 'PropID') || extractTag(rawXml, 'PropertyID') || extractTag(rawXml, 'propertyid') || null;
    const eventType = determineEventType(rawXml);

    // Extract guest & booking details
    const guestFirstName = extractTag(rawXml, 'GuestName') || extractTag(rawXml, 'FirstName') || '';
    const guestLastName = extractTag(rawXml, 'GuestSurname') || extractTag(rawXml, 'LastName') || '';
    const guestName = `${guestFirstName} ${guestLastName}`.trim() || 'RU Guest';
    const guestEmail = extractTag(rawXml, 'Email') || extractTag(rawXml, 'email') || 'ru-notification@rentalsunited.com';
    const guestPhone = extractTag(rawXml, 'Phone') || extractTag(rawXml, 'phone') || null;
    const dateFrom = extractTag(rawXml, 'DateFrom') || extractTag(rawXml, 'datefrom') || null;
    const dateTo = extractTag(rawXml, 'DateTo') || extractTag(rawXml, 'dateto') || null;
    const numGuests = parseInt(extractTag(rawXml, 'NumberOfGuests') || extractTag(rawXml, 'numberofguests') || '1', 10);
    const ruPrice = parseFloat(extractTag(rawXml, 'RUPrice') || extractTag(rawXml, 'ruprice') || '0');

    console.log(`[ru-reservation-handler] Event: ${eventType}, RU Reservation: ${ruReservationId}, RU Property: ${ruPropertyId}, Guest: ${guestName}`);

    // Try to match to a ROL'OS property
    let propertyId: string | null = null;
    let roomTypeId: string | null = null;
    if (ruPropertyId) {
      // Check room types first (multi-unit)
      const { data: roomType } = await supabase
        .from('hostfully_room_types')
        .select('property_id, id')
        .eq('rentalsunited_property_id', ruPropertyId)
        .limit(1)
        .maybeSingle();

      if (roomType?.property_id) {
        propertyId = roomType.property_id;
        roomTypeId = roomType.id;
      } else {
        // Check properties table (single-unit)
        const { data: prop } = await supabase
          .from('properties')
          .select('id')
          .eq('rentalsunited_property_id', ruPropertyId)
          .limit(1)
          .maybeSingle();
        if (prop?.id) propertyId = prop.id;
      }
    }

    // Log to ru_notifications
    const { data: notification, error: insertErr } = await supabase.from('ru_notifications').insert({
      event_type: eventType,
      ru_reservation_id: ruReservationId,
      ru_property_id: ruPropertyId,
      property_id: propertyId,
      raw_xml: rawXml,
      processed: false,
    }).select('id').single();

    if (insertErr) {
      console.error('[ru-reservation-handler] Failed to log notification:', insertErr.message);
    } else {
      console.log(`[ru-reservation-handler] Notification logged (property: ${propertyId || 'unmatched'})`);
    }

    const notificationId = notification?.id;

    // --- Phase 2: Process into bookings ---

    if (eventType === 'reservation_confirmed' && propertyId && ruReservationId && dateFrom && dateTo) {
      // Dedup: check if booking already exists
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('external_reservation_id', ruReservationId)
        .eq('integration_type', 'rentalsunited')
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(`[ru-reservation-handler] Booking already exists for RU reservation ${ruReservationId}, skipping`);
      } else {
        // ── Currency: if this property publishes converted rates at Rentals United
        // (because RU would not hold ZAR for its location), the inbound RUPrice is in the
        // published currency. Convert it back to the authored currency at the exact
        // effective rate used on the push, and keep the original amount on the record.
        let bookedAmount = ruPrice || 0;
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
            console.log(`[ru-reservation-handler] Converted inbound ${ccyState.published_currency_iso} ${original} → ${ccyState.authored_currency_iso} ${bookedAmount} at ${ccyState.effective_rate}`);
          }
        } catch (e) {
          console.warn('[ru-reservation-handler] Currency state lookup failed:', e instanceof Error ? e.message : e);
        }

        const bookingData: Record<string, unknown> = {
          property_id: propertyId,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          check_in_date: dateFrom,
          check_out_date: dateTo,
          adults: numGuests || 1,
          total_price: bookedAmount,
          status: 'confirmed',
          booking_channel: 'rentals_united',
          integration_type: 'rentalsunited',
          external_reservation_id: ruReservationId,
          payment_status: 'paid_externally',
        };

        if (roomTypeId) {
          bookingData.room_type_id = roomTypeId;
        }
        if (currencyMeta) {
          bookingData.ai_metadata = currencyMeta;
        }

        const { error: bookingErr } = await supabase.from('bookings').insert(bookingData);

        if (bookingErr) {
          console.error(`[ru-reservation-handler] Failed to create booking: ${bookingErr.message}`);
        } else {
          console.log(`[ru-reservation-handler] ✅ Booking created for RU reservation ${ruReservationId}`);
        }
      }

      // Mark notification as processed
      if (notificationId) {
        await supabase.from('ru_notifications').update({ processed: true }).eq('id', notificationId);
      }
    } else if (eventType === 'reservation_cancelled' && ruReservationId) {
      // Find and cancel existing booking
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('external_reservation_id', ruReservationId)
        .eq('integration_type', 'rentalsunited')
        .limit(1)
        .maybeSingle();

      if (existingBooking) {
        const { error: cancelErr } = await supabase
          .from('bookings')
          .update({ status: 'cancelled', cancellation_reason: 'Cancelled via Rentals United' })
          .eq('id', existingBooking.id);

        if (cancelErr) {
          console.error(`[ru-reservation-handler] Failed to cancel booking: ${cancelErr.message}`);
        } else {
          console.log(`[ru-reservation-handler] ✅ Booking cancelled for RU reservation ${ruReservationId}`);
        }
      } else {
        console.warn(`[ru-reservation-handler] No existing booking found for cancelled RU reservation ${ruReservationId}`);
      }

      if (notificationId) {
        await supabase.from('ru_notifications').update({ processed: true }).eq('id', notificationId);
      }
    } else if (eventType === 'lead') {
      console.log(`[ru-reservation-handler] Lead received — logged only, no booking created`);
      if (notificationId) {
        await supabase.from('ru_notifications').update({ processed: true }).eq('id', notificationId);
      }
    }

    // Return 200 with XML so RU marks delivery as complete
    return new Response('<Response>OK</Response>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('[ru-reservation-handler] Error:', error);
    // Still return 200 to prevent RU from retrying endlessly
    return new Response('<Response>OK</Response>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  }
});
