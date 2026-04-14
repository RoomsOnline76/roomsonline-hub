import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Cron job: Pull reservations from Rentals United every 30 minutes.
 * Safety net alongside RLNM — catches missed push notifications.
 * Queries last 7 days of reservations via Pull_ListReservations_RQ.
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

function extractAllBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(regex) || [];
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const summary = { total: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0, unmatched: 0 };

  try {
    // Date range: last 7 days → today
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const dateTo = formatDate(now);
    const dateFrom = formatDate(sevenDaysAgo);

    console.log(`[cron-pull-ru] Polling reservations from ${dateFrom} to ${dateTo}`);

    // Call rentalsunited-api with list_reservations action
    const { data: ruResult, error: ruErr } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'list_reservations', date_from: dateFrom, date_to: dateTo },
    });

    if (ruErr || !ruResult?.success) {
      const msg = ruErr?.message || ruResult?.error?.message || 'Unknown error';
      console.error(`[cron-pull-ru] API call failed: ${msg}`);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawXml: string = ruResult.raw_xml || '';
    if (!rawXml || rawXml.length < 50) {
      console.log('[cron-pull-ru] No reservations XML returned');
      return new Response(JSON.stringify({ success: true, summary }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract all <Reservation> blocks
    const reservationBlocks = extractAllBlocks(rawXml, 'Reservation');
    summary.total = reservationBlocks.length;
    console.log(`[cron-pull-ru] Found ${reservationBlocks.length} reservation(s)`);

    for (const block of reservationBlocks) {
      try {
        const ruReservationId = extractTag(block, 'ReservationID');
        const statusId = extractTag(block, 'StatusID') || extractTag(block, 'Status');
        const ruPropertyId = extractTag(block, 'PropID') || extractTag(block, 'PropertyID');
        const dateFromRes = extractTag(block, 'DateFrom');
        const dateToRes = extractTag(block, 'DateTo');
        const guestFirstName = extractTag(block, 'FirstName') || extractTag(block, 'GuestName') || '';
        const guestLastName = extractTag(block, 'LastName') || extractTag(block, 'GuestSurname') || '';
        const guestName = `${guestFirstName} ${guestLastName}`.trim() || 'RU Guest';
        const guestEmail = extractTag(block, 'Email') || 'ru-poll@rentalsunited.com';
        const guestPhone = extractTag(block, 'Phone') || null;
        const numGuests = parseInt(extractTag(block, 'NumberOfGuests') || '1', 10);
        const ruPrice = parseFloat(extractTag(block, 'RUPrice') || '0');

        if (!ruReservationId) {
          console.warn('[cron-pull-ru] Skipping reservation without ID');
          summary.skipped++;
          continue;
        }

        // Determine status: 1=confirmed, 2=modified, 4=cancelled
        const isCancelled = statusId === '4';
        const isConfirmed = statusId === '1' || statusId === '2';

        if (!isConfirmed && !isCancelled) {
          console.log(`[cron-pull-ru] Skipping reservation ${ruReservationId} with status ${statusId}`);
          summary.skipped++;
          continue;
        }

        // Resolve RU property ID to internal property/room type
        let propertyId: string | null = null;
        let roomTypeId: string | null = null;
        if (ruPropertyId) {
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
            const { data: prop } = await supabase
              .from('properties')
              .select('id')
              .eq('rentalsunited_property_id', ruPropertyId)
              .limit(1)
              .maybeSingle();
            if (prop?.id) propertyId = prop.id;
          }
        }

        if (!propertyId) {
          console.warn(`[cron-pull-ru] No matching property for RU PropID ${ruPropertyId}, reservation ${ruReservationId}`);
          summary.unmatched++;
          // Still log to ru_notifications
          await supabase.from('ru_notifications').insert({
            event_type: `poll_${isCancelled ? 'reservation_cancelled' : 'reservation_confirmed'}`,
            ru_reservation_id: ruReservationId,
            ru_property_id: ruPropertyId,
            property_id: null,
            raw_xml: block,
            processed: false,
          });
          continue;
        }

        // Check if booking already exists
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('external_reservation_id', ruReservationId)
          .eq('integration_type', 'rentalsunited')
          .limit(1)
          .maybeSingle();

        if (isCancelled) {
          if (existing && existing.status !== 'cancelled') {
            await supabase
              .from('bookings')
              .update({ status: 'cancelled', cancellation_reason: 'Cancelled via Rentals United (poll sync)' })
              .eq('id', existing.id);
            summary.cancelled++;
            console.log(`[cron-pull-ru] ✅ Cancelled booking for RU reservation ${ruReservationId}`);
          } else {
            summary.skipped++;
          }
        } else if (isConfirmed) {
          if (existing) {
            // Update existing booking with latest data
            const updateData: Record<string, unknown> = {};
            if (dateFromRes) updateData.check_in_date = dateFromRes;
            if (dateToRes) updateData.check_out_date = dateToRes;
            if (guestName !== 'RU Guest') updateData.guest_name = guestName;
            if (guestEmail !== 'ru-poll@rentalsunited.com') updateData.guest_email = guestEmail;
            if (guestPhone) updateData.guest_phone = guestPhone;
            if (numGuests > 0) updateData.adults = numGuests;
            if (ruPrice > 0) updateData.total_price = ruPrice;
            if (existing.status === 'cancelled') updateData.status = 'confirmed';

            if (Object.keys(updateData).length > 0) {
              await supabase.from('bookings').update(updateData).eq('id', existing.id);
              summary.updated++;
              console.log(`[cron-pull-ru] ✅ Updated booking for RU reservation ${ruReservationId}`);
            } else {
              summary.skipped++;
            }
          } else {
            // Create new booking
            if (!dateFromRes || !dateToRes) {
              console.warn(`[cron-pull-ru] Skipping reservation ${ruReservationId} — missing dates`);
              summary.skipped++;
              continue;
            }

            const bookingData: Record<string, unknown> = {
              property_id: propertyId,
              guest_name: guestName,
              guest_email: guestEmail,
              guest_phone: guestPhone,
              check_in_date: dateFromRes,
              check_out_date: dateToRes,
              adults: numGuests || 1,
              total_price: ruPrice || 0,
              status: 'confirmed',
              booking_channel: 'rentals_united',
              integration_type: 'rentalsunited',
              external_reservation_id: ruReservationId,
              payment_status: 'paid_externally',
            };
            if (roomTypeId) bookingData.room_type_id = roomTypeId;

            const { error: bookingErr } = await supabase.from('bookings').insert(bookingData);
            if (bookingErr) {
              console.error(`[cron-pull-ru] Failed to create booking for ${ruReservationId}: ${bookingErr.message}`);
              summary.failed++;
            } else {
              summary.created++;
              console.log(`[cron-pull-ru] ✅ Created booking for RU reservation ${ruReservationId}`);
            }
          }
        }

        // Log to ru_notifications
        await supabase.from('ru_notifications').insert({
          event_type: `poll_${isCancelled ? 'reservation_cancelled' : 'reservation_confirmed'}`,
          ru_reservation_id: ruReservationId,
          ru_property_id: ruPropertyId,
          property_id: propertyId,
          raw_xml: block,
          processed: true,
        });

      } catch (resErr) {
        console.error(`[cron-pull-ru] Error processing reservation:`, resErr);
        summary.failed++;
      }
    }

    console.log(`[cron-pull-ru] Done. Summary:`, JSON.stringify(summary));
    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cron-pull-ru] Fatal error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error), summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
