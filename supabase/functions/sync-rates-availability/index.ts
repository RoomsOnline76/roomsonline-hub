import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { property_id, external_system, start_date, end_date } = await req.json();

    console.log(`Syncing rates for property ${property_id} from ${external_system}`);

    // Get property details
    const { data: property, error: propertyError } = await supabaseClient
      .from('properties')
      .select('*, external_id, amenities')
      .eq('id', property_id)
      .single();

    if (propertyError || !property) {
      throw new Error(`Property not found: ${propertyError?.message}`);
    }

    // Get API keys for the external system
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('system_type', external_system)
      .limit(1);

    if (keysError || !apiKeys || apiKeys.length === 0) {
      throw new Error(`API keys not configured for ${external_system}`);
    }

    const apiKey = apiKeys[0];

    let rates: any[] = [];
    let availability: any[] = [];

    // Fetch from NightsBridge
    if (external_system === 'nightsbridge') {
      const externalIds = property.amenities?.external_ids || {};
      const nightsBridgeId = externalIds.nightsbridge_bb_id;

      if (!nightsBridgeId) {
        throw new Error('NightsBridge property ID not configured');
      }

      // Call NightsBridge API
      const response = await fetch(
        `https://api.nightsbridge.com/v1/properties/${nightsBridgeId}/rates?start=${start_date}&end=${end_date}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey.key_value}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`NightsBridge API error: ${response.statusText}`);
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
        throw new Error('Checkfront property ID not configured');
      }

      // Call Checkfront API
      const response = await fetch(
        `https://api.checkfront.com/v3/item/${checkfrontId}/rates?start=${start_date}&end=${end_date}`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${apiKey.key_value}:`)}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Checkfront API error: ${response.statusText}`);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sync error:', errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
