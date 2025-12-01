import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  property_id: z.string().uuid({ message: 'Invalid property ID format' }),
  external_system: z.enum(['nightsbridge', 'checkfront'], { 
    errorMap: () => ({ message: 'External system must be nightsbridge or checkfront' }) 
  }),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Start date must be in YYYY-MM-DD format' }),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'End date must be in YYYY-MM-DD format' }),
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

    const { property_id, external_system, start_date, end_date } = validationResult.data;

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
