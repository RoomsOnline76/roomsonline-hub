import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  booking_id: z.string().uuid({ message: 'Invalid booking ID format' }),
});

// Helper to get Benson auth header
function getBensonAuthHeader(username: string, password: string): string {
  const encoder = new TextEncoder();
  const credentials = `${username}:${password}`;
  const bytes = encoder.encode(credentials);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `Basic ${btoa(binary)}`;
}

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
    const externalSystem = property.external_system;

    if (!externalSystem) {
      console.log('No external system configured for property');
      return new Response(
        JSON.stringify({ success: true, message: 'No external system configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    // Push to Benson
    if (externalSystem === 'benson') {
      try {
        const propertyCode = property.benson_property_code;
        
        if (!propertyCode) {
          throw new Error('Benson property code not configured');
        }

        // Get active environment
        const { data: envSetting } = await supabaseClient
          .from('api_keys')
          .select('key_value')
          .eq('key_name', 'BENSON_ACTIVE_ENVIRONMENT')
          .single();

        const activeEnv = envSetting?.key_value || 'staging';
        console.log(`Using Benson ${activeEnv} environment`);

        // Get credentials for active environment
        const { data: credentials, error: credError } = await supabaseClient
          .from('pms_credentials')
          .select('*')
          .eq('system_type', 'benson')
          .eq('environment', activeEnv)
          .eq('is_active', true)
          .single();

        if (credError || !credentials) {
          throw new Error(`Benson ${activeEnv} credentials not configured`);
        }

        const { username, password, base_url } = credentials;
        
        if (!username || !password) {
          throw new Error('Benson username/password not configured');
        }

        const authHeader = getBensonAuthHeader(username, password);
        
        // Use base_url as-is if provided (it should include /api/v3/integrations path)
        // Otherwise construct the full URL
        let apiBaseUrl: string;
        if (base_url) {
          // Remove trailing slash if present
          apiBaseUrl = base_url.replace(/\/$/, '');
        } else {
          apiBaseUrl = activeEnv === 'production' 
            ? 'https://api.bensonsoftware.com/api/v3/integrations' 
            : 'https://staging-api.bensonsoftware.com/api/v3/integrations';
        }

        // Build rooms array from booking data
        const rooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0
          ? booking.rooms.map((room: any) => ({
              roomTypeId: parseInt(room.roomTypeId) || 0,
              numberOfAdults: room.numberOfAdults || 1,
              numberOfTeens: room.numberOfTeens || 0,
              numberOfChildren: room.numberOfChildren || 0,
              numberOfInfants: room.numberOfInfants || 0,
            }))
          : [{
              roomTypeId: parseInt(booking.room_type_id) || 0,
              numberOfAdults: booking.adults || 1,
              numberOfTeens: booking.teens || 0,
              numberOfChildren: booking.children || 0,
              numberOfInfants: booking.infants || 0,
            }];

        // Build Benson reservation payload
        const reservationPayload = {
          arrivalDate: booking.check_in_date,
          departureDate: booking.check_out_date,
          rateTypeId: parseInt(booking.rate_type_id) || 0,
          contactName: booking.guest_name,
          contactNumber: booking.guest_phone || '+0000000000',
          contactEmail: booking.guest_email,
          voucher: booking.voucher || '',
          note: booking.special_requests || '',
          rooms: rooms,
        };

        console.log('Benson reservation payload:', JSON.stringify(reservationPayload, null, 2));

        const url = `${apiBaseUrl}/${propertyCode}/reservations`;
        console.log('Posting to Benson URL:', url);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reservationPayload),
        });

        const responseText = await response.text();
        console.log('Benson response status:', response.status);
        console.log('Benson response:', responseText);

        if (!response.ok) {
          throw new Error(`Benson API error: ${response.status} - ${responseText}`);
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { raw: responseText };
        }

        const externalBookingId = result.id || result.reservationId || result.reservationNumber;

        // Update booking with external reservation ID
        if (externalBookingId) {
          await supabaseClient
            .from('bookings')
            .update({ external_reservation_id: String(externalBookingId) })
            .eq('id', booking_id);
        }

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'benson',
          external_booking_id: externalBookingId ? String(externalBookingId) : null,
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
          external_system: 'benson',
          sync_type: 'booking_push',
          status: 'success',
          message: `Booking pushed successfully to Benson`,
          request_data: reservationPayload,
          response_data: result,
        });

        results.push({
          system: 'benson',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to Benson:', errorMessage);

        // Update sync status with error
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'benson',
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
          external_system: 'benson',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'benson',
          success: false,
          error: errorMessage,
        });
      }
    }

    // Push to NightsBridge
    else if (externalSystem === 'nightsbridge') {
      try {
        const apiKeyValue = Deno.env.get('NIGHTSBRIDGE_API_KEY');

        if (!apiKeyValue) {
          throw new Error('NightsBridge API key not configured');
        }

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
              'Authorization': `Bearer ${apiKeyValue}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('NightsBridge API error:', response.status, errorText);
          throw new Error('Failed to sync with NightsBridge');
        }

        const result = await response.json();
        const externalBookingId = result.booking_id || result.id;

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'nightsbridge',
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
          external_system: 'nightsbridge',
          sync_type: 'booking_push',
          status: 'success',
          message: `Booking pushed successfully to NightsBridge`,
          response_data: { external_booking_id: externalBookingId },
        });

        results.push({
          system: 'nightsbridge',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to NightsBridge:', errorMessage);

        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'nightsbridge',
          sync_status: 'failed',
          sync_attempts: 1,
          last_sync_at: new Date().toISOString(),
          error_message: errorMessage,
        }, {
          onConflict: 'booking_id,external_system',
        });

        await supabaseClient.from('sync_logs').insert({
          booking_id,
          property_id: property.id,
          external_system: 'nightsbridge',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'nightsbridge',
          success: false,
          error: errorMessage,
        });
      }
    }

    // Push to Checkfront
    else if (externalSystem === 'checkfront') {
      try {
        const apiKeyValue = Deno.env.get('CHECKFRONT_API_KEY');

        if (!apiKeyValue) {
          throw new Error('Checkfront API key not configured');
        }

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
              'Authorization': `Basic ${btoa(`${apiKeyValue}:`)}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Checkfront API error:', response.status, errorText);
          throw new Error('Failed to sync with Checkfront');
        }

        const result = await response.json();
        const externalBookingId = result.booking_id || result.id;

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'checkfront',
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
          external_system: 'checkfront',
          sync_type: 'booking_push',
          status: 'success',
          message: `Booking pushed successfully to Checkfront`,
          response_data: { external_booking_id: externalBookingId },
        });

        results.push({
          system: 'checkfront',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to Checkfront:', errorMessage);

        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'checkfront',
          sync_status: 'failed',
          sync_attempts: 1,
          last_sync_at: new Date().toISOString(),
          error_message: errorMessage,
        }, {
          onConflict: 'booking_id,external_system',
        });

        await supabaseClient.from('sync_logs').insert({
          booking_id,
          property_id: property.id,
          external_system: 'checkfront',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'checkfront',
          success: false,
          error: errorMessage,
        });
      }
    }

    // Send booking confirmation email after processing
    const anySuccess = results.some((r: any) => r.success);
    const firstError = results.find((r: any) => !r.success);
    
    try {
      console.log('Triggering booking confirmation email...');
      
      // Use internal fetch to call the send-booking-email function
      const emailResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            booking_id,
            status: anySuccess ? 'success' : 'failed',
            error_message: firstError?.error || undefined,
          }),
        }
      );

      if (!emailResponse.ok) {
        const emailError = await emailResponse.text();
        console.error('Failed to send booking email:', emailError);
      } else {
        console.log('Booking email sent successfully');
      }
    } catch (emailError) {
      // Don't fail the whole response if email fails
      console.error('Error sending booking email:', emailError);
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