import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRIPADVISOR_BASE_URL = 'https://api.content.tripadvisor.com/api/v1';

interface TripAdvisorRequest {
  action: 'get_location_details' | 'get_location_reviews';
  locationId: string;
  language?: string;
  limit?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client to fetch API key from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch TripAdvisor API key from api_keys table
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'TRIPADVISOR_API_KEY')
      .maybeSingle();

    if (apiKeyError) {
      console.error('Error fetching TripAdvisor API key:', apiKeyError);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve TripAdvisor API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = apiKeyData?.key_value;
    if (!apiKey) {
      console.error('TRIPADVISOR_API_KEY not configured in database');
      return new Response(
        JSON.stringify({ error: 'TripAdvisor API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, locationId, language = 'en', limit = 5 }: TripAdvisorRequest = await req.json();
    console.log(`TripAdvisor API request: action=${action}, locationId=${locationId}`);

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: 'locationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let url: string;
    
    switch (action) {
      case 'get_location_details':
        url = `${TRIPADVISOR_BASE_URL}/location/${locationId}/details?language=${language}&currency=USD&key=${apiKey}`;
        break;
      case 'get_location_reviews':
        url = `${TRIPADVISOR_BASE_URL}/location/${locationId}/reviews?language=${language}&limit=${limit}&key=${apiKey}`;
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Fetching from TripAdvisor: ${action}, URL: ${url.replace(apiKey, '***')}`);
    
    // Get origin from request for Referer header
    const origin = req.headers.get('origin') || 'https://book.sleepinafrica.roomsonline.co.za';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Referer': origin,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`TripAdvisor API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `TripAdvisor API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`TripAdvisor API success: ${action}`);
    
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('TripAdvisor API function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
