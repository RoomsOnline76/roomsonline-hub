import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * RU Reservation Live Notification Mechanism (RLNM) Handler
 *
 * Receives POST XML from Rentals United for:
 * - Confirmed reservations
 * - Cancelled reservations
 * - New leads
 *
 * Logs to ru_notifications table. Phase 2 will trigger booking creation.
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

    console.log(`[ru-reservation-handler] Event: ${eventType}, RU Reservation: ${ruReservationId}, RU Property: ${ruPropertyId}`);

    // Try to match to a ROL'OS property
    let propertyId: string | null = null;
    if (ruPropertyId) {
      // Check room types first (multi-unit)
      const { data: roomType } = await supabase
        .from('hostfully_room_types')
        .select('property_id')
        .eq('rentalsunited_property_id', ruPropertyId)
        .limit(1)
        .maybeSingle();

      if (roomType?.property_id) {
        propertyId = roomType.property_id;
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
    const { error: insertErr } = await supabase.from('ru_notifications').insert({
      event_type: eventType,
      ru_reservation_id: ruReservationId,
      ru_property_id: ruPropertyId,
      property_id: propertyId,
      raw_xml: rawXml,
      processed: false,
    });

    if (insertErr) {
      console.error('[ru-reservation-handler] Failed to log notification:', insertErr.message);
    } else {
      console.log(`[ru-reservation-handler] Notification logged (property: ${propertyId || 'unmatched'})`);
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
