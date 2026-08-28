import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from 'npm:zod@3.23.8';
import { enqueueJobs, kickWorker } from "../_shared/jobQueue.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  booking_id: z.string().uuid({ message: 'Invalid booking ID format' }),
  integration_type: z.string().optional(),
  source_url: z.string().optional(),
});

// Map country names to ISO 2-letter codes for Hostfully API
function getCountryCode(countryName: string): string {
  const countryMap: Record<string, string> = {
    'south africa': 'ZA',
    'united states': 'US',
    'usa': 'US',
    'united kingdom': 'GB',
    'uk': 'GB',
    'australia': 'AU',
    'canada': 'CA',
    'germany': 'DE',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'netherlands': 'NL',
    'portugal': 'PT',
    'brazil': 'BR',
    'namibia': 'NA',
    'botswana': 'BW',
    'zimbabwe': 'ZW',
    'zambia': 'ZM',
    'mozambique': 'MZ',
    'kenya': 'KE',
    'tanzania': 'TZ',
    'mauritius': 'MU',
    'seychelles': 'SC',
    'egypt': 'EG',
    'morocco': 'MA',
    'nigeria': 'NG',
    'ghana': 'GH',
    'rwanda': 'RW',
    'uganda': 'UG',
    'malawi': 'MW',
    'lesotho': 'LS',
    'eswatini': 'SZ',
    'swaziland': 'SZ',
  };
  
  const normalized = (countryName || '').toLowerCase().trim();
  return countryMap[normalized] || 'ZA'; // Default to South Africa
}

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

    const { booking_id, integration_type, source_url } = validationResult.data;

    // Persist integration tracking metadata if provided
    if (integration_type || source_url) {
      const trackingUpdate: Record<string, string> = {};
      if (integration_type) trackingUpdate.integration_type = integration_type;
      if (source_url) trackingUpdate.source_url = source_url;
      await supabaseClient
        .from('bookings')
        .update(trackingUpdate)
        .eq('id', booking_id);
      console.log(`Integration tracking set: type=${integration_type}, source=${source_url}`);
    }

    console.log(`Pushing booking ${booking_id} to external systems`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, property:properties!bookings_property_id_fkey(*)')
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

    // Track whether ROL PMS adapter failed so we can fall through to manual blocking
    let rolAdapterFailed = false;

    // ─── MULTI-UNIT AUTO-ASSIGNMENT SUB-STEP ───────────────────────────
    // Runs AFTER live availability verification, BEFORE reservation creation.
    // Only activates when property has multi_unit_config.enabled = true.
    let assignedUnitId: string | null = null;
    const multiUnitConfig = property.multi_unit_config as { enabled?: boolean; default_mode?: string } | null;
    
    if (multiUnitConfig?.enabled) {
      try {
        console.log('Multi-unit mode enabled — attempting auto-assignment');
        const roomTypeId = booking.room_type_id;
        
        if (roomTypeId) {
          // Get pms_mappings for this room type to find child units
          const { data: mappings } = await supabaseClient
            .from('pms_mappings')
            .select('child_unit_ids, assignment_mode')
            .eq('property_id', property.id)
            .eq('internal_id', roomTypeId)
            .single();
          
          const childUnits = (mappings?.child_unit_ids || []) as Array<{ unit_id: string; unit_name: string }>;
          const mode = mappings?.assignment_mode || multiUnitConfig.default_mode || 'round_robin';
          
          if (childUnits.length > 0) {
            if (mode === 'round_robin') {
              // Get the last assigned unit for this room type
              const { data: lastBooking } = await supabaseClient
                .from('bookings')
                .select('ai_metadata')
                .eq('property_id', property.id)
                .eq('room_type_id', roomTypeId)
                .not('ai_metadata->assigned_unit_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
              
              const lastAssigned = (lastBooking?.ai_metadata as any)?.assigned_unit_id;
              const lastIndex = lastAssigned 
                ? childUnits.findIndex(u => u.unit_id === lastAssigned)
                : -1;
              const nextIndex = (lastIndex + 1) % childUnits.length;
              assignedUnitId = childUnits[nextIndex].unit_id;
              console.log(`Round-robin assigned unit: ${childUnits[nextIndex].unit_name} (${assignedUnitId})`);
              
            } else if (mode === 'lowest_occupancy') {
              // Count booked nights per unit in the booking date range
              const unitOccupancy = new Map<string, number>();
              for (const unit of childUnits) {
                const { count } = await supabaseClient
                  .from('property_availability')
                  .select('*', { count: 'exact', head: true })
                  .eq('property_id', property.id)
                  .eq('room_type', unit.unit_id)
                  .gte('date', booking.check_in_date)
                  .lt('date', booking.check_out_date)
                  .eq('available_units', 0);
                unitOccupancy.set(unit.unit_id, count || 0);
              }
              
              // Pick unit with fewest booked nights
              let minOcc = Infinity;
              let bestUnit = childUnits[0];
              for (const unit of childUnits) {
                const occ = unitOccupancy.get(unit.unit_id) || 0;
                if (occ < minOcc) { minOcc = occ; bestUnit = unit; }
              }
              assignedUnitId = bestUnit.unit_id;
              console.log(`Lowest-occupancy assigned unit: ${bestUnit.unit_name} (${assignedUnitId})`);
            }
            
            // Persist assignment in booking metadata
            if (assignedUnitId) {
              await supabaseClient.from('bookings').update({
                ai_metadata: {
                  ...(booking.ai_metadata as object || {}),
                  assigned_unit_id: assignedUnitId,
                  assignment_mode: mode,
                  assigned_at: new Date().toISOString(),
                },
              }).eq('id', booking.id);
            }
          }
        }
      } catch (unitError) {
        console.error('Multi-unit assignment error (non-fatal):', unitError);
        // Non-fatal — booking proceeds at room-type level
      }
    }
    // ─── END MULTI-UNIT AUTO-ASSIGNMENT ────────────────────────────────

    // Check if this is a ROL'OS native property first
    if (property.is_rol_property) {
      console.log('ROL property detected - creating native reservation via roomsonline-pms-api');
      
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        
        // Build rooms array
        const bookingRooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0
          ? booking.rooms.map((r: any) => ({
              room_type_id: r.roomTypeId || r.room_type_id || booking.room_type_id,
              adults: r.numberOfAdults || r.adults || booking.adults || 1,
              teens: r.numberOfTeens || r.teens || booking.teens || 0,
              children: r.numberOfChildren || r.children || booking.children || 0,
              infants: r.numberOfInfants || r.infants || booking.infants || 0,
            }))
          : [{
              room_type_id: booking.room_type_id || 'default',
              adults: booking.adults || 1,
              teens: booking.teens || 0,
              children: booking.children || 0,
              infants: booking.infants || 0,
            }];

        const pmsResponse = await fetch(`${supabaseUrl}/functions/v1/roomsonline-pms-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create_reservation',
            propertyId: property.id,
            arrival_date: booking.check_in_date,
            departure_date: booking.check_out_date,
            room_type_id: bookingRooms[0]?.room_type_id || 'default',
            rate_type_id: booking.rate_type_id || 'default',
            guest: {
              name: booking.guest_name,
              email: booking.guest_email,
              phone: booking.guest_phone,
            },
            rooms: bookingRooms,
            special_requests: booking.special_requests || '',
            voucher: booking.voucher || '',
          }),
        });

        const pmsResult = await pmsResponse.json();
        
        if (pmsResult.success) {
          const reservationId = pmsResult.data?.reservation_id;
          
          // Update booking with confirmation
          await supabaseClient.from('bookings').update({
            status: 'confirmed',
            external_reservation_id: reservationId,
          }).eq('id', booking_id);

          // Notification emails follow on the background queue — the PMS already holds the stay.
          const ownerEmail = property.owner_email;
          await enqueueJobs(supabaseClient, [
            ...(ownerEmail
              ? [{
                  type: "booking_email" as const,
                  payload: { booking_id, status: "property_notification", recipient_email: ownerEmail },
                  options: { dedupeKey: `email:owner:${booking_id}` },
                }]
              : []),
            ...(booking.booking_channel !== 'rol_itinerary'
              ? [{
                  type: "booking_email" as const,
                  payload: { booking_id, status: "success" },
                  options: { dedupeKey: `email:confirmation:${booking_id}` },
                }]
              : []),
          ]);
          kickWorker();

          return new Response(
            JSON.stringify({ success: true, message: 'ROL reservation created', reservation_id: reservationId }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.error('ROL PMS reservation failed:', pmsResult.error);
          throw new Error(pmsResult.error?.message || 'ROL reservation creation failed');
        }
      } catch (rolError) {
        console.error('Error creating ROL reservation:', rolError);
        // CRITICAL FIX: Even if PMS adapter fails, payment was already processed.
        // Fall through to manual date-blocking mode to prevent double-bookings.
        console.log('ROL PMS adapter failed — falling through to manual date-blocking as fallback');
        rolAdapterFailed = true;

        // Log the sync failure for observability
        try {
          await supabaseClient.from('booking_sync_status').upsert({
            booking_id: booking_id,
            external_system: 'roomsonline',
            sync_status: 'failed',
            error_message: String(rolError),
            last_sync_at: new Date().toISOString(),
            sync_attempts: 1,
          }, { onConflict: 'booking_id,external_system' });
          await supabaseClient.from('sync_logs').insert({
            property_id: property.id,
            booking_id: booking_id,
            system_type: 'roomsonline',
            direction: 'outbound',
            action: 'create_reservation',
            status: 'error',
            error_message: String(rolError),
          });
        } catch (logErr) {
          console.error('Failed to log sync failure:', logErr);
        }
      }
    }

    // Manual mode: block dates for properties without external PMS,
    // OR as a fallback when the ROL PMS adapter fails (rolAdapterFailed flag)
    if (!externalSystem || externalSystem === 'none' || rolAdapterFailed) {
      console.log('Blocking dates in manual mode for property — externalSystem:', externalSystem);
      
      // Mark as confirmed (no PMS to sync to)
      await supabaseClient
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', booking_id);
      
      // Block the booked dates in property_availability table
      // This prevents double-bookings for manual properties
      try {
        const checkInDate = new Date(booking.check_in_date);
        const checkOutDate = new Date(booking.check_out_date);
        const availabilityRecords = [];
        
        // Get room type from booking for targeting specific room
        const bookingRooms = booking.rooms && Array.isArray(booking.rooms) && booking.rooms.length > 0
          ? booking.rooms
          : [{ room_type_id: booking.room_type_id || null, room_type_name: null }];
        
        // Build a map of room IDs to names from property config for fallback resolution
        const roomTypeMap = new Map<string, string>();
        const amenities = property.amenities as { room_types?: Array<{id: string | number; name: string}> } | null;
        if (amenities?.room_types) {
          for (const rt of amenities.room_types) {
            roomTypeMap.set(String(rt.id), rt.name);
          }
        }
        console.log(`Room type map built with ${roomTypeMap.size} entries:`, Array.from(roomTypeMap.entries()));
        
        // Create a record for each date in the booking range
        for (let d = new Date(checkInDate); d < checkOutDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          
          // For each room in the booking, create or update availability
          for (const room of bookingRooms) {
            // Support both camelCase and snake_case field names
            const roomId = room.roomTypeId || room.room_type_id;
            const roomName = room.roomTypeName || room.room_type_name || 
                            (roomId ? roomTypeMap.get(String(roomId)) : null);
            
            // Determine final room_type value - prioritize name, fallback to ID as string
            const roomType = roomName || (roomId ? String(roomId) : null);
            
            if (!roomType) {
              console.warn('Room has no identifiable type - skipping availability block:', JSON.stringify(room));
              continue;
            }
            
            availabilityRecords.push({
              property_id: property.id,
              date: dateStr,
              available_units: 0, // Block this date
              is_stop_sell: true, // Mark as stop-sell
              room_type: String(roomType), // Ensure string format
              external_system: 'manual', // Match existing records for manual properties
              // Stamped so the row is recognisable as this reservation's own hold: an
              // unstamped row is indistinguishable from an operator block and kept
              // painting "Blocked by the property" after the stay was cancelled.
              blocked_reason: `booking:${booking_id}`,
              blocked_by_label: "ROL'OS reservation",
              blocked_at: new Date().toISOString(),
            });
          }
        }
        
        console.log(`Blocking ${availabilityRecords.length} date slots for booking`);
        
        // Upsert availability records (update if exists, insert if not)
        const { error: availError } = await supabaseClient
          .from('property_availability')
          .upsert(availabilityRecords, {
            onConflict: 'property_id,room_type,date,external_system',
            ignoreDuplicates: false,
          });
        
        if (availError) {
          console.error('Failed to block dates:', availError);
          // Continue with booking even if blocking fails - owner notification will cover this
        } else {
          console.log(`Successfully blocked ${availabilityRecords.length} dates for booking`);
        }
      } catch (blockError) {
        console.error('Error blocking dates:', blockError);
        // Don't fail the booking if date blocking fails
      }

      // The booking and its blocked nights are committed. The channel push and the notification
      // emails follow on the background queue so confirming a booking never waits on them.
      const ownerEmail = property.owner_email;
      await enqueueJobs(supabaseClient, [
        {
          // Focused push: the booked unit and the sold nights only. The shared booking sync
          // registers the reservation and queues the scoped availability/price delta.
          type: "channel_booking_sync" as const,
          payload: { booking_id, change: "created" },
          options: { dedupeKey: `channel_booking_sync:${booking_id}:created` },
        },

        ...(ownerEmail
          ? [{
              type: "booking_email" as const,
              payload: { booking_id, status: "property_notification", recipient_email: ownerEmail },
              options: { dedupeKey: `email:owner:${booking_id}` },
            }]
          : []),
        // Itinerary bookings receive a single journey email instead of per-booking mail.
        ...(booking.booking_channel !== "rol_itinerary"
          ? [{
              type: "booking_email" as const,
              payload: { booking_id, status: "success" },
              options: { dedupeKey: `email:confirmation:${booking_id}` },
            }]
          : []),
      ]);
      kickWorker();
      if (!ownerEmail) console.warn('No owner_email configured for property:', property.id);

      
      
      return new Response(
        JSON.stringify({ success: true, message: 'Booking confirmed, dates blocked, owner notified' }),
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
          error_code: errorMessage.includes('Insufficient availability') ? 'AVAILABILITY_CHANGED' : 'BOOKING_FAILED',
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

        // =========================================================================
        // RULE #1: Verify LIVE availability with PMS before ANY booking creation
        // =========================================================================
        console.log(`[RULE #1] Verifying LIVE availability with Checkfront`);

        const availCheckResponse = await fetch(
          `https://api.checkfront.com/v3/item/${checkfrontId}/availability?start_date=${booking.check_in_date}&end_date=${booking.check_out_date}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${btoa(`${apiKeyValue}:`)}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!availCheckResponse.ok) {
          const availErrorText = await availCheckResponse.text();
          console.error('Checkfront availability check failed:', availCheckResponse.status, availErrorText);
          throw new Error(`AVAILABILITY_CHANGED: Unable to verify availability with Checkfront`);
        }

        const availData = await availCheckResponse.json();
        if (availData.item?.status === 'STOP' || availData.available === false) {
          throw new Error(`AVAILABILITY_CHANGED: Item is no longer available for selected dates`);
        }

        console.log(`Live Checkfront availability verified successfully`);

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
          error_code: errorMessage.includes('AVAILABILITY_CHANGED') ? 'AVAILABILITY_CHANGED' : 'BOOKING_FAILED',
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

        // =========================================================================
        // RULE #1: Verify LIVE availability with PMS before ANY booking creation
        // =========================================================================
        console.log(`[RULE #1] Verifying LIVE availability with Cloudbeds`);

        const availCheckResponse = await fetch(
          `https://hotels.cloudbeds.com/api/v1.1/getAvailableRoomTypes?propertyID=${cloudbedsPropertyId}&startDate=${booking.check_in_date}&endDate=${booking.check_out_date}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!availCheckResponse.ok) {
          const availErrorText = await availCheckResponse.text();
          console.error('Cloudbeds availability check failed:', availCheckResponse.status, availErrorText);
          throw new Error(`AVAILABILITY_CHANGED: Unable to verify availability with Cloudbeds`);
        }

        const availData = await availCheckResponse.json();
        if (availData.success === false || !availData.data?.length) {
          throw new Error(`AVAILABILITY_CHANGED: No rooms available for selected dates`);
        }

        // Validate each requested room type has availability
        for (const room of bookingRooms) {
          const roomTypeAvail = availData.data?.find((rt: any) => rt.roomTypeID === room.roomTypeId);
          if (!roomTypeAvail || roomTypeAvail.roomsAvailable < 1) {
            throw new Error(`AVAILABILITY_CHANGED: Room type ${room.roomTypeId} is no longer available`);
          }
        }

        console.log(`Live Cloudbeds availability verified successfully`);

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
          error_code: errorMessage.includes('AVAILABILITY_CHANGED') ? 'AVAILABILITY_CHANGED' : 'BOOKING_FAILED',
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

        // Helper to generate fresh HotelBeds signature (signature expires quickly)
        const generateHotelbedsSignature = async (): Promise<string> => {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signatureData = api_key + apiSecret + timestamp;
          const encoder = new TextEncoder();
          const data = encoder.encode(signatureData);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const baseUrl = environment === 'production' 
          ? 'https://api.hotelbeds.com' 
          : 'https://api.test.hotelbeds.com';

        // Extract rate_key from the rooms JSONB (stored during booking creation)
        const roomsData = booking.rooms as any[];
        const rateKey = roomsData?.[0]?.rate_key;
        
        if (!rateKey) {
          throw new Error('AVAILABILITY_CHANGED: Missing rate_key - availability may have expired. Please select dates again.');
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
        // For ALL booking actions → Hit PMS LIVE first (CheckRate), then write result.
        // Cache is NEVER authoritative. PMS ALWAYS is.
        // NOTE: HotelBeds TEST environment does NOT have CheckRate API access!
        // =========================================================================

        let validatedRateKey = rateKey;

        if (environment === 'production') {
          // PRODUCTION: Full CheckRate verification (RULE #1 enforced)
          console.log(`[RULE #1] Verifying LIVE availability with HotelBeds CheckRate API`);

          const checkRateSignature = await generateHotelbedsSignature();
          const checkRateResponse = await fetch(
            `${baseUrl}/hotel-api/1.0/checkrates`,
            {
              method: 'POST',
              headers: {
                'Api-key': api_key,
                'X-Signature': checkRateSignature,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
              },
              body: JSON.stringify({
                rooms: [{ rateKey: rateKey }],
              }),
            }
          );

          const checkRateText = await checkRateResponse.text();
          console.log('CheckRate response status:', checkRateResponse.status);
          console.log('CheckRate response:', checkRateText);

          if (!checkRateResponse.ok) {
            console.error('CheckRate failed:', checkRateResponse.status, checkRateText);
            throw new Error(`AVAILABILITY_CHANGED: Rate is no longer available (${checkRateResponse.status}). Please select different dates.`);
          }

          let checkRateResult;
          try {
            checkRateResult = JSON.parse(checkRateText);
          } catch {
            throw new Error(`AVAILABILITY_CHANGED: Invalid CheckRate response. Please try again.`);
          }

          // Check for API-level error in CheckRate response
          if (checkRateResult.error) {
            console.error('CheckRate API error:', checkRateResult.error);
            throw new Error(`AVAILABILITY_CHANGED: ${checkRateResult.error.message || 'Rate expired or sold out'}. Please select again.`);
          }

          // Extract the validated (possibly updated) rate key
          validatedRateKey = checkRateResult.hotel?.rooms?.[0]?.rates?.[0]?.rateKey || rateKey;
          console.log(`Live PMS availability verified successfully via CheckRate`);
        } else {
          // TEST/STAGING: Skip CheckRate AND booking API (sandbox is read-only)
          console.log(`[RULE #1 SKIPPED] HotelBeds test environment - CheckRate API not available`);
          console.log(`[BOOKING MOCKED] HotelBeds sandbox is read-only - returning mock success response`);
          
          // Generate a mock booking reference for testing
          const mockBookingId = `TEST-HB-${Date.now()}`;
          
          // Update booking with mock external reservation ID
          await supabaseClient
            .from('bookings')
            .update({ external_reservation_id: mockBookingId })
            .eq('id', booking_id);
          
          externalReservationIds.push(mockBookingId);
          
          // Update sync status
          await supabaseClient.from('booking_sync_status').upsert({
            booking_id,
            external_system: 'hotelbeds',
            external_booking_id: mockBookingId,
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
            message: 'Booking mocked for HotelBeds test environment',
            response_data: { external_booking_id: mockBookingId, mocked: true },
          });

          results.push({
            system: 'hotelbeds',
            success: true,
            external_booking_id: mockBookingId,
            mocked: true,
          });
          
          // Skip the real booking API call - jump to end of HotelBeds block
          // (The code below won't execute, we return early from this branch)
        }

        // Only proceed with real booking API if NOT test environment
        if (environment === 'production') {
          // Build HotelBeds booking payload using validated rate key
          const bookingPayload = {
            holder: {
              name: booking.guest_name.split(' ')[0] || 'Guest',
              surname: booking.guest_name.split(' ').slice(1).join(' ') || 'Guest',
            },
            rooms: [{
              rateKey: validatedRateKey,
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

          // Generate fresh signature for the booking call (signatures expire quickly)
          const bookingSignature = await generateHotelbedsSignature();

          const response = await fetch(
            `${baseUrl}/hotel-api/1.0/bookings`,
            {
              method: 'POST',
              headers: {
                'Api-key': api_key,
                'X-Signature': bookingSignature,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
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
        } // End of production environment block

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
          error_code: errorMessage.includes('AVAILABILITY_CHANGED') ? 'AVAILABILITY_CHANGED' : 'BOOKING_FAILED',
        });
      }
    }

    // Push to Hostfully
    else if (externalSystem === 'hostfully') {
      try {
        console.log('Processing Hostfully booking...');

        // Get owner credentials for Hostfully
        let ownerCreds: any = null;

        // Option 1: Use property.owner_pms_credential_id directly (most reliable)
        if (property.owner_pms_credential_id) {
          console.log(`Looking up credentials by owner_pms_credential_id: ${property.owner_pms_credential_id}`);
          const { data } = await supabaseClient
            .from('owner_pms_credentials')
            .select('*')
            .eq('id', property.owner_pms_credential_id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (data) {
            ownerCreds = data;
            console.log(`Found credentials via owner_pms_credential_id`);
          }
        }

        // Option 2: Fallback - try to get credentials via owner_email -> profile -> credentials
        if (!ownerCreds && property.owner_email) {
          console.log(`Fallback: Looking up credentials via owner_email: ${property.owner_email}`);
          const { data: ownerProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('email', property.owner_email)
            .maybeSingle();

          if (ownerProfile) {
            const { data } = await supabaseClient
              .from('owner_pms_credentials')
              .select('*')
              .eq('owner_id', ownerProfile.id)
              .eq('system_type', 'hostfully')
              .eq('is_active', true)
              .maybeSingle();
            
            if (data) {
              ownerCreds = data;
              console.log(`Found credentials via owner_email fallback`);
            }
          }
        }

        if (!ownerCreds) {
          throw new Error('Hostfully owner credentials not configured for this property');
        }

        const apiKey = ownerCreds.api_key;
        if (!apiKey) {
          throw new Error('Hostfully API key not found in owner credentials');
        }

        // Get environment from pms_tracker_status
        const { data: trackerData } = await supabaseClient
          .from('pms_tracker_status')
          .select('active_environment')
          .eq('system_type', 'hostfully')
          .maybeSingle();

        const environment = trackerData?.active_environment || 'sandbox';
        // CRITICAL: Use v3 API endpoints (v2 returns 404 "Endpoint not found")
        const baseUrl = environment === 'production'
          ? 'https://api.hostfully.com/api/v3'
          : 'https://sandbox.hostfully.com/api/v3';

        console.log(`Using Hostfully ${environment} environment at ${baseUrl}`);

        // Resolve Hostfully property UID
        let hostfullyUid: string | null = null;

        // Option 1: Check property.external_id
        if (property.external_id) {
          hostfullyUid = property.external_id;
        }

        // Option 2: Extract from amenities.room_types[0].hostfullyId
        if (!hostfullyUid) {
          const roomTypes = property.amenities?.room_types || [];
          if (roomTypes.length > 0) {
            const firstRoom = roomTypes[0];
            hostfullyUid = firstRoom.hostfullyId || firstRoom.pmsRoomId || null;
          }
        }

        // Option 3: Query hostfully_room_types table
        if (!hostfullyUid) {
          const { data: hfRoom } = await supabaseClient
            .from('hostfully_room_types')
            .select('hostfully_room_id')
            .eq('property_id', property.id)
            .limit(1)
            .maybeSingle();

          hostfullyUid = hfRoom?.hostfully_room_id || null;
        }

        if (!hostfullyUid) {
          throw new Error('Could not resolve Hostfully property UID');
        }

        console.log(`Resolved Hostfully UID: ${hostfullyUid}`);

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
        // =========================================================================
        console.log(`[RULE #1] Verifying LIVE availability with Hostfully before booking`);

        const calendarUrl = `${baseUrl}/property-calendar/${hostfullyUid}?from=${booking.check_in_date}&to=${booking.check_out_date}`;
        console.log(`Checking live availability: ${calendarUrl}`);

        const availResponse = await fetch(calendarUrl, {
          method: 'GET',
          headers: {
            'X-HOSTFULLY-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!availResponse.ok) {
          const availErrorText = await availResponse.text();
          console.error('Hostfully availability check failed:', availResponse.status, availErrorText);
          throw new Error(`AVAILABILITY_CHANGED: Hostfully availability verification failed: ${availResponse.status}`);
        }

        const liveAvailability = await availResponse.json();
        console.log(`Live availability response received from Hostfully`);

        // Check if any date is unavailable
        const calendarEntries = liveAvailability?.calendar?.entries || liveAvailability?.entries || [];
        const unavailableDates = calendarEntries.filter((entry: any) => 
          entry.availability?.unavailable === true || entry.unavailable === true
        );

        if (unavailableDates.length > 0) {
          console.error('Dates unavailable:', unavailableDates.map((d: any) => d.date));
          throw new Error(`AVAILABILITY_CHANGED: Some dates are no longer available. Please select different dates.`);
        }

        console.log('Live availability confirmed - all dates available');

        // Create lead/reservation in Hostfully
        const guestName = booking.guest_name || 'Guest';
        const nameParts = guestName.split(' ');
        const firstName = nameParts[0] || 'Guest';
        const lastName = nameParts.slice(1).join(' ') || 'Guest';

        // Validate agency UID exists
        if (!ownerCreds.external_account_id) {
          throw new Error('Hostfully Agency UID not configured in owner credentials');
        }

        // Format dates as ISO 8601 datetime strings (Hostfully requires this format)
        const checkInDateTime = `${booking.check_in_date}T14:00:00`;
        const checkOutDateTime = `${booking.check_out_date}T11:00:00`;

        // Get country code from property country (defaults to ZA for South Africa)
        const propertyCountry = property.country || 'South Africa';
        const countryCode = getCountryCode(propertyCountry);
        console.log(`Using country code: ${countryCode} (from property country: ${propertyCountry})`);

        const leadPayload = {
          agencyUid: ownerCreds.external_account_id,  // Required - Hostfully agency identifier
          propertyUid: hostfullyUid,
          checkInLocalDateTime: checkInDateTime,  // ISO 8601 format required
          checkOutLocalDateTime: checkOutDateTime,  // ISO 8601 format required
          guestInformation: {
            firstName: firstName,
            lastName: lastName,
            email: booking.guest_email,
            phoneNumber: booking.guest_phone || '',
            // Guest counts MUST be inside guestInformation for Hostfully v3 API
            adultCount: booking.adults || 1,
            childrenCount: booking.children || 0,
            infantCount: booking.infants || 0,
            petCount: booking.pets || 0,
            // Country code to prevent Hostfully defaulting to US
            countryCode: countryCode,
          },
          // Keep top-level for logging/backwards compatibility
          adults: booking.adults || 1,
          children: booking.children || 0,
          notes: booking.special_requests || '',
          source: 'HOSTFULLY_API',
          status: 'NEW',
        };

        console.log('Hostfully lead payload:', JSON.stringify(leadPayload, null, 2));

        const leadResponse = await fetch(`${baseUrl}/leads`, {
          method: 'POST',
          headers: {
            'X-HOSTFULLY-APIKEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(leadPayload),
        });

        const leadResponseText = await leadResponse.text();
        console.log('Hostfully lead response status:', leadResponse.status);
        console.log('Hostfully lead response:', leadResponseText);

        if (!leadResponse.ok) {
          throw new Error(`Hostfully API error: ${leadResponse.status} - ${leadResponseText}`);
        }

        let leadResult;
        try {
          leadResult = JSON.parse(leadResponseText);
        } catch {
          leadResult = { raw: leadResponseText };
        }

        const externalBookingId = leadResult.uid || leadResult.id || leadResult.leadUid;

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
          external_system: 'hostfully',
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
          external_system: 'hostfully',
          sync_type: 'booking_push',
          status: 'success',
          message: 'Booking pushed successfully to Hostfully',
          request_data: leadPayload,
          response_data: leadResult,
        });

        results.push({
          system: 'hostfully',
          success: true,
          external_booking_id: externalBookingId,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error pushing to Hostfully:', errorMessage);

        await supabaseClient.from('booking_sync_status').upsert({
          booking_id,
          external_system: 'hostfully',
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
          external_system: 'hostfully',
          sync_type: 'booking_push',
          status: 'error',
          message: errorMessage,
        });

        results.push({
          system: 'hostfully',
          success: false,
          error: errorMessage,
          error_code: errorMessage.includes('AVAILABILITY_CHANGED') ? 'AVAILABILITY_CHANGED' : 'BOOKING_FAILED',
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
    
    // CRITICAL: If payment was successful, guest should get a success email
    // even if PMS sync failed (that's a backend issue, not guest's problem)
    // Re-fetch booking to get latest payment_status
    const { data: latestBooking } = await supabaseClient
      .from('bookings')
      .select('payment_status')
      .eq('id', booking_id)
      .single();
    
    const paymentSucceeded = latestBooking?.payment_status === 'paid';
    
    // Determine email status: 
    // - If payment succeeded OR PMS sync succeeded -> success email
    // - Only send failure email if both payment failed AND PMS sync failed
    const emailStatus = (paymentSucceeded || anySuccess) ? 'success' : 'failed';
    
    // If PMS sync failed but payment succeeded, include a note (but still success email)
    let syncWarning: string | undefined;
    if (paymentSucceeded && !anySuccess && firstError) {
      syncWarning = `Note: Your payment was successful, but we encountered a minor sync issue. Our team has been notified and will ensure your booking is confirmed with the property.`;
      console.log('[Push Booking] Payment succeeded but PMS sync failed - flagging for intervention and sending admin alert');
      
      // Flag booking as requiring manual intervention
      const { error: flagError } = await supabaseClient
        .from('bookings')
        .update({ requires_intervention: true })
        .eq('id', booking_id);
      
      if (flagError) {
        console.error('[Push Booking] Failed to set requires_intervention flag:', flagError);
      } else {
        console.log('[Push Booking] Booking flagged for intervention');
      }
      
      // Send admin alert email
      try {
        console.log('[Push Booking] Sending admin alert email...');
        const adminAlertResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              booking_id,
              status: 'admin_alert',
              error_message: firstError?.error || 'Unknown sync error',
            }),
          }
        );
        
        if (!adminAlertResponse.ok) {
          const alertError = await adminAlertResponse.text();
          console.error('[Push Booking] Failed to send admin alert:', alertError);
        } else {
          console.log('[Push Booking] Admin alert email sent successfully');
        }
      } catch (alertError) {
        console.error('[Push Booking] Error sending admin alert:', alertError);
      }
    }
    
    // Send guest email ONLY if NOT part of an itinerary
    // (Itinerary bookings get a single journey email from multi-push-booking instead)
    if (booking.booking_channel !== 'rol_itinerary') {
      try {
        console.log(`Triggering booking ${emailStatus} email (payment: ${paymentSucceeded ? 'paid' : 'unpaid'}, PMS: ${anySuccess ? 'synced' : 'failed'})...`);
        
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
              status: emailStatus,
              error_message: emailStatus === 'failed' ? (firstError?.error || undefined) : undefined,
              sync_warning: syncWarning,
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
    } else {
      console.log('Skipping individual booking email - this is part of an itinerary (will receive journey email instead)');
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
