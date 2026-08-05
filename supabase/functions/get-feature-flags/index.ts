import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WHITELIST: Only these keys can be exposed as feature flags (boolean values)
const ALLOWED_FEATURE_FLAGS = [
  'ROOMSONLINE_ACTIVE',
  'HOME_ICON_OPEN_NEW_TAB',
  'BOOK_OPEN_NEW_TAB',
  'AI_CONCIERGE_ENABLED',
];

// STRING FLAGS: These return string values (not boolean)
const ALLOWED_STRING_FLAGS = [
  'BENSON_ACTIVE_ENVIRONMENT',
];

// PUBLIC KEYS: These are safe to expose (publishable keys, not secrets)
const ALLOWED_PUBLIC_KEYS = [
  'google_maps_api_key',
  'google_recaptcha_site_key',
];

// EDGE FUNCTION SECRETS: These are accessed directly from Deno.env, not from api_keys table
// These are OAuth client IDs that are required in the frontend for OAuth flows
const EDGE_FUNCTION_SECRETS = [
  'HOSTFULLY_CLIENT_ID',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Keep-warm probe — no client, no query, no table read.
  if (req.headers.get('x-warm') === '1') {
    return new Response(JSON.stringify({ success: true, warm: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }



  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch only whitelisted keys
    const allAllowedKeys = [...ALLOWED_FEATURE_FLAGS, ...ALLOWED_STRING_FLAGS, ...ALLOWED_PUBLIC_KEYS];
    
    const { data, error } = await supabase
      .from('api_keys')
      .select('key_name, key_value')
      .in('key_name', allAllowedKeys);

    if (error) {
      console.error('Error fetching feature flags:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform to response object
    const flags: Record<string, boolean | string | null> = {};
    
    // Boolean flags - convert string "true"/"false" to boolean, default to false
    for (const keyName of ALLOWED_FEATURE_FLAGS) {
      const row = data?.find(r => r.key_name === keyName);
      flags[keyName.toLowerCase()] = row?.key_value === 'true';
    }

    // String flags - return as-is, default to null
    for (const keyName of ALLOWED_STRING_FLAGS) {
      const row = data?.find(r => r.key_name === keyName);
      flags[keyName.toLowerCase()] = row?.key_value || null;
    }

    // Public keys - return as-is (these are publishable keys, not secrets)
    for (const keyName of ALLOWED_PUBLIC_KEYS) {
      const row = data?.find(r => r.key_name === keyName);
      flags[keyName] = row?.key_value || null;
    }

    // Edge function secrets - accessed from Deno.env (for OAuth client IDs needed in frontend)
    for (const keyName of EDGE_FUNCTION_SECRETS) {
      const value = Deno.env.get(keyName);
      flags[keyName.toLowerCase()] = value || null;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: flags 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Unexpected error in get-feature-flags:', err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
