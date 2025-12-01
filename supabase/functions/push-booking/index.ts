import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  booking_id: z.string().uuid({ message: 'Invalid booking ID format' }),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid booking ID' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { booking_id } = validationResult.data;

    console.log(`Pushing booking ${booking_id} to external systems`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, property:properties(*)')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('Booking lookup failed:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Unable to find booking' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const property = booking.property;
    const externalSystems = property.external_system?.split(',') || [];

    const results = [];

    for (const system of externalSystems) {
      const systemName = system.trim();
      
      try {
        // Get API keys for the external system
        const { data: apiKeys, error: keysError } = await supabaseClient
          .from('api_keys')
          .select('*')
          .eq('system_type', systemName)
          .limit(1);

        if (keysError || !apiKeys || apiKeys.length === 0) {
          throw new Error(`API keys not configured for ${systemName}`);
        }

        const apiKey = apiKeys[0];

        let externalBookingId = null;

        // Push to NightsBridge
        if (systemName === 'nightsbridge') {
          const externalIds = property.amenities?.external_ids || {};
          const nightsBridgeId = externalIds.nightsbridge_bb_id;

          if (!nightsBridgeId) {
            throw new Error('NightsBridge property ID not configured');
          }

          const bookingData = {
            property_id: nightsBridgeId,
            check_in: booking.check_in_date,
            check_out: booking.check_out_date,
            guest: {
              name: booking.guest_name,
              email: booking.guest_email,
              phone: booking.guest_phone,
            },
            adults: booking.adults,
            children: booking.children,
            total_amount: booking.total_price,
            special_requests: booking.special_requests,
            status: 'confirmed',
          };

          const response = await fetch(
            'https://api.nightsbridge.com/v1/bookings',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey.key_value}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(bookingData),
            }
          );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('NightsBridge API error:', response.status, errorText);
          throw new Error('Failed to sync with external system');
        }

          const result = await response.json();
          externalBookingId = result.booking_id || result.id;
        }

        // Push to Checkfront
        else if (systemName === 'checkfront') {
          const externalIds = property.amenities?.external_ids || {};
          const checkfrontId = externalIds.checkfront_id;

          if (!checkfrontId) {
            throw new Error('Checkfront property ID not configured');
          }

          const bookingData = {
            item_id: checkfrontId,
            start_date: booking.check_in_date,
            end_date: booking.check_out_date,
            customer_name: booking.guest_name,
            customer_email: booking.guest_email,
            customer_phone: booking.guest_phone,
            adults: booking.adults,
            children: booking.children,
            total: booking.total_price,
            notes: booking.special_requests,
            status: 'PAID',
          };

          const response = await fetch(
            'https://api.checkfront.com/v3/booking',
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`${apiKey.key_value}:`)}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(bookingData),
            }
          );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Checkfront API error:', response.status, errorText);
          throw new Error('Failed to sync with external system');
        }

          const result = await response.json();
          externalBookingId = result.booking_id || result.id;
        }

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: systemName,
          external_booking_id: externalBookingId,
          sync_status: 'synced',
          sync_attempts: 1,
          last_sync_at: new Date().toISOString(),
          error_message: null,
        }, {
          onConflict: 'booking_id,external_system',
        });

        // Log success
        await supabaseClient.from('sync_logs').insert({
          booking_id,
          property_id: property.id,
          external_system: systemName,
          sync_type: 'booking_push',
          status: 'success',
          message: `Booking pushed successfully to ${systemName}`,
          response_data: { external_booking_id: externalBookingId },
        });

        results.push({
          system: systemName,
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error pushing to ${systemName}:`, errorMessage);

        // Update sync status with error
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: systemName,
          sync_status: 'failed',
          sync_attempts: 1,
          last_sync_at: new Date().toISOString(),
          error_message: errorMessage,
        }, {
          onConflict: 'booking_id,external_system',
        });

        // Log error
        await supabaseClient.from('sync_logs').insert({
          booking_id,
          property_id: property.id,
          external_system: systemName,
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: systemName,
          success: false,
          error: errorMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Push booking error:', error);

    return new Response(
      JSON.stringify({ error: 'An error occurred while processing booking' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
