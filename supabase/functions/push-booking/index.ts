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

// Helper to group rooms by date range
function groupRoomsByDateRange(rooms: any[], defaultCheckIn: string, defaultCheckOut: string) {
  const groups: Map<string, any[]> = new Map();
  
  for (const room of rooms) {
    const checkIn = room.checkIn || defaultCheckIn;
    const checkOut = room.checkOut || defaultCheckOut;
    const key = `${checkIn}|${checkOut}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({
      ...room,
      checkIn,
      checkOut,
    });
  }
  
  return groups;
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

    const results: any[] = [];
    const externalReservationIds: string[] = [];

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
          apiBaseUrl = base_url.replace(/\/$/, '');
        } else {
          apiBaseUrl = activeEnv === 'production' 
            ? 'https://api.bensonsoftware.com/api/v3/integrations' 
            : 'https://staging-api.bensonsoftware.com/api/v3/integrations';
        }

        // =========================================================================
        // ██████╗ ██╗   ██╗██╗     ███████╗     ██╗
        // ██╔══██╗██║   ██║██║     ██╔════╝    ███║
        // ██████╔╝██║   ██║██║     █████╗      ╚██║
        // ██╔══██╗██║   ██║██║     ██╔══╝       ██║
        // ██║  ██║╚██████╔╝███████╗███████╗     ██║
        // ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝     ╚═╝
        // 
        // UNBREAKABLE RULE: NO BOOKING IS EVER CREATED FROM CACHE DATA ALONE
        // 
        // For ALL booking actions → Hit PMS LIVE first, then write result.
        // Cache is NEVER authoritative. PMS ALWAYS is.
        // 
        // This block MUST remain and MUST NOT be bypassed under any circumstances.
        // =========================================================================
        console.log(`[RULE #1] Verifying LIVE availability with PMS before ANY booking creation`);
        
        const availabilityUrl = `${apiBaseUrl}/${propertyCode}/availability?startDate=${booking.check_in_date}&endDate=${booking.check_out_date}`;
        console.log(`Checking live availability: ${availabilityUrl}`);
        
        const availResponse = await fetch(availabilityUrl, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });
        
        if (!availResponse.ok) {
          const availErrorText = await availResponse.text();
          console.error('Live availability check failed:', availResponse.status, availErrorText);
          throw new Error(`PMS availability verification failed: ${availResponse.status}`);
        }
        
        const liveAvailability = await availResponse.json();
        console.log(`Live availability response received, validating rooms...`);

        // Get rooms array or create single room from legacy fields
        const bookingRooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0
          ? booking.rooms
          : [{
              roomTypeId: booking.room_type_id,
              numberOfAdults: booking.adults || 1,
              numberOfTeens: booking.teens || 0,
              numberOfChildren: booking.children || 0,
              numberOfInfants: booking.infants || 0,
              checkIn: booking.check_in_date,
              checkOut: booking.check_out_date,
            }];

        // Validate each room type has availability in live PMS data
        const availabilityByRoomType = new Map<string, number>();
        if (Array.isArray(liveAvailability)) {
          for (const roomType of liveAvailability) {
            const minAvailable = roomType.roomsAvailablePerNight?.reduce(
              (min: number, day: any) => Math.min(min, day.numberOfRoomsAvailable || 0),
              Infinity
            ) || 0;
            availabilityByRoomType.set(roomType.roomTypeId.toString(), minAvailable);
          }
        }

        // Count rooms needed per type
        const roomsNeededByType = new Map<string, number>();
        for (const room of bookingRooms) {
          const typeId = room.roomTypeId?.toString() || '';
          roomsNeededByType.set(typeId, (roomsNeededByType.get(typeId) || 0) + 1);
        }

        // Check availability
        for (const [typeId, needed] of roomsNeededByType) {
          const available = availabilityByRoomType.get(typeId) || 0;
          if (available < needed) {
            const errorMsg = `Insufficient availability for room type ${typeId}: need ${needed}, PMS shows ${available} available`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
        }
        
        console.log(`Live PMS availability verified successfully`);

        // Group rooms by date range
        const roomGroups = groupRoomsByDateRange(bookingRooms, booking.check_in_date, booking.check_out_date);
        
        console.log(`Booking has ${roomGroups.size} date range group(s)`);

        // If all rooms have same dates, single API call
        // If different dates, separate API calls for each date range group
        for (const [dateKey, groupRooms] of roomGroups) {
          const [arrivalDate, departureDate] = dateKey.split('|');
          
          console.log(`Processing group: ${arrivalDate} to ${departureDate} with ${groupRooms.length} room(s)`);

          // Build rooms array for this group (no per-room dates needed since they're all the same)
          const rooms = groupRooms.map((room: any) => ({
            roomTypeId: parseInt(room.roomTypeId) || 0,
            numberOfAdults: room.numberOfAdults || 1,
            numberOfTeens: room.numberOfTeens || 0,
            numberOfChildren: room.numberOfChildren || 0,
            numberOfInfants: room.numberOfInfants || 0,
          }));

          // Build Benson reservation payload
          const reservationPayload = {
            arrivalDate,
            departureDate,
            rateTypeId: parseInt(booking.rate_type_id) || 0,
            contactName: booking.guest_name,
            contactNumber: booking.guest_phone || '+0000000000',
            contactEmail: booking.guest_email,
            voucher: booking.voucher || '',
            note: booking.special_requests || '',
            rooms,
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
          
          if (externalBookingId) {
            externalReservationIds.push(String(externalBookingId));
          }

          // Log success for this group
          await supabaseClient.from('sync_logs').insert({
            booking_id,
            property_id: property.id,
            external_system: 'benson',
            sync_type: 'booking_push',
            status: 'success',
            message: `Booking pushed successfully to Benson (${arrivalDate} to ${departureDate})`,
            request_data: reservationPayload,
            response_data: result,
          });

          results.push({
            system: 'benson',
            success: true,
            external_booking_id: externalBookingId,
            dates: { arrivalDate, departureDate },
            rooms: groupRooms.length,
          });
        }

        // Combine all external reservation IDs
        const combinedExternalId = externalReservationIds.join(', ');

        // Update booking with external reservation ID(s)
        if (combinedExternalId) {
          await supabaseClient
            .from('bookings')
            .update({ external_reservation_id: combinedExternalId })
            .eq('id', booking_id);
        }

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'benson',
          external_booking_id: combinedExternalId || null,
          sync_status: 'synced',
          sync_attempts: 1,
          last_sync_at: new Date().toISOString(),
          error_message: null,
        }, {
          onConflict: 'booking_id,external_system',
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

    // Push to Cloudbeds
    else if (externalSystem === 'cloudbeds') {
      try {
        const cloudbedsPropertyId = property.cloudbeds_property_id;
        
        if (!cloudbedsPropertyId) {
          throw new Error('Cloudbeds property ID not configured');
        }

        // Get Cloudbeds credentials
        const { data: credentials, error: credError } = await supabaseClient
          .from('pms_credentials')
          .select('*')
          .eq('system_type', 'cloudbeds')
          .eq('is_active', true)
          .single();

        if (credError || !credentials) {
          throw new Error('Cloudbeds credentials not configured');
        }

        const { api_key } = credentials;
        
        if (!api_key) {
          throw new Error('Cloudbeds API key not configured');
        }

        // Get rooms array or create single room from legacy fields
        const bookingRooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0
          ? booking.rooms
          : [{
              roomTypeId: booking.room_type_id,
              numberOfAdults: booking.adults || 1,
              numberOfChildren: booking.children || 0,
            }];

        // Build Cloudbeds reservation payload
        const reservationPayload = {
          propertyID: cloudbedsPropertyId,
          startDate: booking.check_in_date,
          endDate: booking.check_out_date,
          guestFirstName: booking.guest_name.split(' ')[0] || 'Guest',
          guestLastName: booking.guest_name.split(' ').slice(1).join(' ') || 'Guest',
          guestEmail: booking.guest_email,
          guestPhone: booking.guest_phone || '',
          rooms: bookingRooms.map((room: any) => ({
            roomTypeID: room.roomTypeId,
            adults: room.numberOfAdults || 1,
            children: room.numberOfChildren || 0,
          })),
          thirdPartyIdentifier: booking.voucher || booking.id,
          sendEmailConfirmation: false,
        };

        console.log('Cloudbeds reservation payload:', JSON.stringify(reservationPayload, null, 2));

        const response = await fetch(
          'https://hotels.cloudbeds.com/api/v1.1/postReservation',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(reservationPayload),
          }
        );

        const responseText = await response.text();
        console.log('Cloudbeds response status:', response.status);
        console.log('Cloudbeds response:', responseText);

        if (!response.ok) {
          throw new Error(`Cloudbeds API error: ${response.status} - ${responseText}`);
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { raw: responseText };
        }

        // Check for API-level error
        if (result.success === false) {
          throw new Error(result.message || 'Cloudbeds API returned error');
        }

        const externalBookingId = result.data?.reservationID || result.reservationID || result.id;

        if (externalBookingId) {
          externalReservationIds.push(String(externalBookingId));
          
          // Update booking with external reservation ID
          await supabaseClient
            .from('bookings')
            .update({ external_reservation_id: String(externalBookingId) })
            .eq('id', booking_id);
        }

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'cloudbeds',
          external_booking_id: externalBookingId || null,
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
          external_system: 'cloudbeds',
          sync_type: 'booking_push',
          status: 'success',
          message: 'Booking pushed successfully to Cloudbeds',
          request_data: reservationPayload,
          response_data: result,
        });

        results.push({
          system: 'cloudbeds',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to Cloudbeds:', errorMessage);

        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'cloudbeds',
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
          external_system: 'cloudbeds',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'cloudbeds',
          success: false,
          error: errorMessage,
        });
      }
    }

    // Push to HotelBeds
    else if (externalSystem === 'hotelbeds') {
      try {
        const hotelbedsHotelCode = property.hotelbeds_hotel_code;
        
        if (!hotelbedsHotelCode) {
          throw new Error('HotelBeds hotel code not configured');
        }

        // Get HotelBeds credentials
        const { data: credentials, error: credError } = await supabaseClient
          .from('pms_credentials')
          .select('*')
          .eq('system_type', 'hotelbeds')
          .eq('is_active', true)
          .single();

        if (credError || !credentials) {
          throw new Error('HotelBeds credentials not configured');
        }

        const { api_key, password: apiSecret, environment } = credentials;
        
        if (!api_key || !apiSecret) {
          throw new Error('HotelBeds API key and secret not configured');
        }

        // Generate HotelBeds signature
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signatureData = api_key + apiSecret + timestamp;
        const encoder = new TextEncoder();
        const data = encoder.encode(signatureData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const baseUrl = environment === 'production' 
          ? 'https://api.hotelbeds.com' 
          : 'https://api.test.hotelbeds.com';

        // Build HotelBeds booking payload
        // Note: HotelBeds requires a rateKey from availability check - this should be stored in the booking
        const bookingPayload = {
          holder: {
            name: booking.guest_name.split(' ')[0] || 'Guest',
            surname: booking.guest_name.split(' ').slice(1).join(' ') || 'Guest',
          },
          rooms: [{
            rateKey: (booking as any).rate_key || '', // Should be stored from availability check
            paxes: [
              {
                roomId: 1,
                type: 'AD',
                name: booking.guest_name.split(' ')[0] || 'Guest',
                surname: booking.guest_name.split(' ').slice(1).join(' ') || 'Guest',
              },
            ],
          }],
          clientReference: booking.id,
          remark: booking.special_requests || '',
        };

        console.log('HotelBeds booking payload:', JSON.stringify(bookingPayload, null, 2));

        const response = await fetch(
          `${baseUrl}/hotel-api/1.0/bookings`,
          {
            method: 'POST',
            headers: {
              'Api-key': api_key,
              'X-Signature': signature,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(bookingPayload),
          }
        );

        const responseText = await response.text();
        console.log('HotelBeds response status:', response.status);
        console.log('HotelBeds response:', responseText);

        if (!response.ok) {
          throw new Error(`HotelBeds API error: ${response.status} - ${responseText}`);
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = { raw: responseText };
        }

        // Check for API-level error
        if (result.error) {
          throw new Error(result.error.message || 'HotelBeds API returned error');
        }

        const externalBookingId = result.booking?.reference || result.reference || result.id;

        if (externalBookingId) {
          externalReservationIds.push(String(externalBookingId));
          
          // Update booking with external reservation ID
          await supabaseClient
            .from('bookings')
            .update({ external_reservation_id: String(externalBookingId) })
            .eq('id', booking_id);
        }

        // Update sync status
        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'hotelbeds',
          external_booking_id: externalBookingId || null,
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
          external_system: 'hotelbeds',
          sync_type: 'booking_push',
          status: 'success',
          message: 'Booking pushed successfully to HotelBeds',
          request_data: bookingPayload,
          response_data: result,
        });

        results.push({
          system: 'hotelbeds',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to HotelBeds:', errorMessage);

        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'hotelbeds',
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
          external_system: 'hotelbeds',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'hotelbeds',
          success: false,
          error: errorMessage,
        });
      }
    }

    // Send booking confirmation email after processing
    const anySuccess = results.some((r: any) => r.success);
    const firstError = results.find((r: any) => !r.success);
    
    // Collect all external reservation IDs from successful results
    const allExternalIds = results
      .filter((r: any) => r.success && r.external_booking_id)
      .map((r: any) => r.external_booking_id);
    
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
            external_reservation_ids: allExternalIds,
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
        external_reservation_ids: externalReservationIds,
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
