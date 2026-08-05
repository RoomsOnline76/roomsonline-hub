import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from 'npm:zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  property_id: z.string().uuid({ message: 'Invalid property ID format' }),
  external_system: z.enum(['nightsbridge', 'checkfront', 'littlehotelier', 'hotelbeds', 'hyperguest'], { 
    errorMap: () => ({ message: 'External system must be nightsbridge, checkfront, littlehotelier, hotelbeds, or hyperguest' }) 
  }),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be in YYYY-MM-DD format' }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'End date must be in YYYY-MM-DD format' }),
  nationality: z.string().length(2).optional(), // ISO 3166-1 alpha-2 for HyperGuest rate filtering
});

interface NightsBridgeRate {
  room_type: string;
  date: string;
  rate: number;
  rate_type: string;
  meal_plan?: string;
}

interface CheckfrontRate {
  item_id: string;
  date: string;
  price: number;
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
        JSON.stringify({ error: 'Invalid request parameters' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { property_id, external_system, start_date, end_date, nationality } = validationResult.data;

    console.log(`Syncing rates for property ${property_id} from ${external_system}`);

    // Get property details
    const { data: property, error: propertyError } = await supabaseClient
      .from('properties')
      .select('*, external_id, amenities')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      console.error('Property lookup failed:', propertyError);
      return new Response(
        JSON.stringify({ error: 'Unable to find property' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get API key from environment variables
    const apiKeyEnvVar = external_system === 'nightsbridge' 
      ? 'NIGHTSBRIDGE_API_KEY' 
      : 'CHECKFRONT_API_KEY';
    
    const apiKeyValue = Deno.env.get(apiKeyEnvVar);

    if (!apiKeyValue) {
      console.error(`API key not configured: ${apiKeyEnvVar}`);
      return new Response(
        JSON.stringify({ error: 'System configuration error' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let rates: any[] = [];
    let availability: any[] = [];

    // Fetch from NightsBridge
    if (external_system === 'nightsbridge') {
      const externalIds = property.amenities?.external_ids || {};
      const nightsBridgeId = externalIds.nightsbridge_bb_id;

      if (!nightsBridgeId) {
        console.error('NightsBridge ID not configured for property:', property_id);
        return new Response(
          JSON.stringify({ error: 'Property configuration incomplete' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Call NightsBridge API
      const response = await fetch(
        `https://api.nightsbridge.com/v1/properties/${nightsBridgeId}/rates?start=${start_date}&end=${end_date}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKeyValue}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('NightsBridge API error:', response.status, response.statusText);
        return new Response(
          JSON.stringify({ error: 'Failed to sync with external system' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const data = await response.json();
      rates = data.rates || [];
      availability = data.availability || [];
    }

    // Fetch from Checkfront
    else if (external_system === 'checkfront') {
      const externalIds = property.amenities?.external_ids || {};
      const checkfrontId = externalIds.checkfront_id;

      if (!checkfrontId) {
        console.error('Checkfront ID not configured for property:', property_id);
        return new Response(
          JSON.stringify({ error: 'Property configuration incomplete' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Call Checkfront API
      const response = await fetch(
        `https://api.checkfront.com/v3/item/${checkfrontId}/rates?start=${start_date}&end=${end_date}`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${apiKeyValue}:`)}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('Checkfront API error:', response.status, response.statusText);
        return new Response(
          JSON.stringify({ error: 'Failed to sync with external system' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const data = await response.json();
      rates = data.rates || [];
      availability = data.availability || [];
    }

    // Fetch from Little Hotelier
    else if (external_system === 'littlehotelier') {
      const channelCode = (property as any).littlehotelier_channel_code;
      const region = (property as any).littlehotelier_region || 'apac';

      if (!channelCode) {
        console.error('Little Hotelier channel code not configured for property:', property_id);
        return new Response(
          JSON.stringify({ error: 'Property configuration incomplete' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Call Little Hotelier API via our adapter
      const { data: adapterResponse, error: adapterError } = await supabaseClient.functions.invoke('little-hotelier-api', {
        body: {
          action: 'fetch_availability',
          channel_code: channelCode,
          region: region,
          start_date,
          end_date,
        },
      });

      if (adapterError) {
        console.error('Little Hotelier adapter error:', adapterError);
        return new Response(
          JSON.stringify({ error: 'Failed to sync with external system' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Check for adapter-level error
      if (adapterResponse?.success === false) {
        console.error('Little Hotelier API error:', adapterResponse.error);
        return new Response(
          JSON.stringify({ error: adapterResponse.error?.message || 'Failed to fetch from Little Hotelier' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Transform Little Hotelier data to our format
      const lhData = adapterResponse?.data || {};
      const dailyAvailability = lhData.daily_availability || [];
      const dailyRates = lhData.daily_rates || [];

      // Convert to rates format
      rates = dailyRates.map((rate: any) => ({
        room_type: rate.room_name || 'Standard',
        rate_type: rate.rate_plan_name || 'Standard',
        date: rate.date,
        rate: rate.rate,
      }));

      // Convert to availability format
      availability = dailyAvailability.map((avail: any) => ({
        room_type: avail.room_name || 'Standard',
        date: avail.date,
        available: avail.available,
        stop_sell: avail.stop_sell,
        min_stay: avail.min_stay,
        close_to_arrival: avail.close_to_arrival,
      }));
    }

    // Fetch from HotelBeds
    else if (external_system === 'hotelbeds') {
      const hotelCode = (property as any).hotelbeds_hotel_code;

      if (!hotelCode) {
        console.error('HotelBeds hotel code not configured for property:', property_id);
        return new Response(
          JSON.stringify({ error: 'Property configuration incomplete' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Call HotelBeds API via our adapter
      const { data: adapterResponse, error: adapterError } = await supabaseClient.functions.invoke('hotelbeds-api', {
        body: {
          action: 'fetch_availability',
          property_id,
          start_date,
          end_date,
        },
      });

      if (adapterError) {
        console.error('HotelBeds adapter error:', adapterError);
        return new Response(
          JSON.stringify({ error: 'Failed to sync with external system' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Check for adapter-level error
      if (adapterResponse?.success === false) {
        console.error('HotelBeds API error:', adapterResponse.error);
        return new Response(
          JSON.stringify({ error: adapterResponse.error?.message || 'Failed to fetch from HotelBeds' }),
          { 
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Transform HotelBeds data to our format
      const hbData = adapterResponse?.data || {};
      const roomTypes = hbData.room_types || [];

      // Convert to rates format
      for (const roomType of roomTypes) {
        for (const rateType of (roomType.rate_types || [])) {
          for (const dailyRate of (rateType.daily_rates || [])) {
            rates.push({
              room_type: roomType.name || 'Standard',
              rate_type: rateType.name || 'Standard',
              date: dailyRate.date,
              rate: dailyRate.room_amount,
            });
          }
        }
        
        // Convert to availability format
        for (const avail of (roomType.daily_availability || [])) {
          availability.push({
            room_type: roomType.name || 'Standard',
            date: avail.date,
            available: avail.available_units,
            stop_sell: avail.restrictions?.stop_sell || false,
            min_stay: avail.restrictions?.min_stay,
          });
        }
      }
    }

    // Fetch from HyperGuest
    if (external_system === 'hyperguest') {
      const adapterResponse = await supabaseClient.functions.invoke('hyperguest-api', {
        body: {
          action: 'fetch_availability',
          property_id,
          start_date,
          end_date,
          nationality: nationality || undefined,
        },
      });

      if (adapterResponse.error || !adapterResponse.data?.success) {
        console.error('HyperGuest adapter error:', adapterResponse.error || adapterResponse.data?.error);
        return new Response(
          JSON.stringify({ error: adapterResponse.data?.error?.message || 'Failed to fetch from HyperGuest' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const hgData = adapterResponse.data?.data || {};
      const rooms = hgData.rooms || [];

      for (const room of rooms) {
        for (const rate of (room.rates || [])) {
          for (const dailyRate of (rate.daily_rates || [])) {
            rates.push({
              room_type: room.room_name || 'Standard',
              rate_type: rate.rate_name || rate.rate_type || 'Standard',
              date: dailyRate.date,
              rate: rate.selling_rate || rate.net_amount,
            });
          }
        }
      }
    }

    // Insert/update rates in database
    if (rates.length > 0) {
      const rateRecords = rates.map((rate: any) => ({
        property_id,
        room_type: rate.room_type || rate.item_name || 'Standard',
        rate_type: rate.rate_type || 'UnitRate',
        meal_type: rate.meal_plan || rate.meal_type || 'SelfCatering',
        date: rate.date,
        amount: rate.rate || rate.price,
        currency: property.amenities?.currency || 'ZAR',
        external_system,
        external_rate_id: rate.id,
      }));

      const { error: ratesError } = await supabaseClient
        .from('property_rates')
        .upsert(rateRecords, { 
          onConflict: 'property_id,room_type,rate_type,meal_type,date,external_system',
          ignoreDuplicates: false 
        });

      if (ratesError) {
        console.error('Error upserting rates:', ratesError);
      }
    }

    // Insert/update availability in database
    if (availability.length > 0) {
      const availRecords = availability.map((avail: any) => ({
        property_id,
        room_type: avail.room_type || avail.item_name || 'Standard',
        date: avail.date,
        available_units: avail.available || avail.inventory || 0,
        is_stop_sell: avail.stop_sell || false,
        minimum_stay: avail.min_stay || null,
        maximum_stay: avail.max_stay || null,
        lead_days_advance: avail.lead_days_advance || null,
        lead_days_post: avail.lead_days_post || null,
        external_system,
      }));

      const { error: availError } = await supabaseClient
        .from('property_availability')
        .upsert(availRecords, { 
          onConflict: 'property_id,room_type,date,external_system',
          ignoreDuplicates: false 
        });

      if (availError) {
        console.error('Error upserting availability:', availError);
      }
    }

    // Log sync operation
    await supabaseClient.from('sync_logs').insert({
      property_id,
      external_system,
      sync_type: 'rates',
      status: 'success',
      message: `Synced ${rates.length} rates and ${availability.length} availability records`,
      request_data: { start_date, end_date },
      response_data: { rates_count: rates.length, availability_count: availability.length },
    });

    return new Response(
      JSON.stringify({
        success: true,
        rates_synced: rates.length,
        availability_synced: availability.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);

    return new Response(
      JSON.stringify({ error: 'An error occurred during synchronization' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
