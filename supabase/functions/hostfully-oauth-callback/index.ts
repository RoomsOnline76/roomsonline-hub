import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to get valid app URL - prioritize origin_url from state for cross-domain redirect fix
const getAppUrl = (stateParam?: string | null): string => {
  // First try to extract origin_url from state (for redirect back to same domain user came from)
  if (stateParam) {
    try {
      const stateData = JSON.parse(atob(stateParam));
      if (stateData.origin_url && 
          (stateData.origin_url.startsWith('http://') || stateData.origin_url.startsWith('https://'))) {
        console.log('Using origin_url from state:', stateData.origin_url);
        return stateData.origin_url;
      }
    } catch (e) {
      console.warn('Failed to parse origin_url from state:', e);
    }
  }
  
  // Fallback to APP_URL env variable
  const envUrl = Deno.env.get('APP_URL');
  if (envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return envUrl;
  }
  // Final fallback to production URL
  return 'https://sleepinafrica.roomsonline.co.za';
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // Contains owner_id, environment, etc.
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const status = url.searchParams.get('status'); // Hostfully returns status: SUCCESSFUL, DECLINED, or INCORRECT_REQUEST

    // Log ALL query parameters for debugging
    const allParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      allParams[key] = value;
    });
    console.log('Hostfully OAuth callback - Full URL:', req.url);
    console.log('Hostfully OAuth callback - All params:', JSON.stringify(allParams));
    console.log('Hostfully OAuth callback received:', {
      hasCode: !!code,
      code: code ? `${code.substring(0, 10)}...` : null,
      hasState: !!state,
      status,
      error,
      errorDescription,
    });

    // Helper to extract property_id from state for error redirects
    const getRedirectPath = (stateParam: string | null): string => {
      if (stateParam) {
        try {
          const stateData = JSON.parse(atob(stateParam));
          if (stateData.property_id) {
            return `/admin/properties/${stateData.property_id}`;
          }
        } catch {
          // Failed to parse state, use default
        }
      }
      return '/admin/users';
    };

    // Handle Hostfully-specific status responses
    if (status === 'INCORRECT_REQUEST') {
      console.error('Hostfully returned INCORRECT_REQUEST - check clientId and redirectUri');
      const appUrl = getAppUrl(state);
      const redirectPath = getRedirectPath(state);
      return Response.redirect(
        `${appUrl}${redirectPath}?hostfully_error=incorrect_request&error_description=${encodeURIComponent('The authorization request was invalid. Please check your Hostfully configuration.')}`,
        302
      );
    }

    if (status === 'DECLINED') {
      console.error('Hostfully authorization was declined by user');
      const appUrl = getAppUrl(state);
      const redirectPath = getRedirectPath(state);
      return Response.redirect(
        `${appUrl}${redirectPath}?hostfully_error=declined&error_description=${encodeURIComponent('Authorization was declined.')}`,
        302
      );
    }

    // Handle OAuth errors - redirect back to app with error
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      const appUrl = getAppUrl(state);
      const redirectPath = getRedirectPath(state);
      return Response.redirect(
        `${appUrl}${redirectPath}?hostfully_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
        302
      );
    }

    if (!code) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization code provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!state) {
      return new Response(
        JSON.stringify({ success: false, error: 'No state parameter provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse state - contains owner_id, property_id, credential_id, environment, and origin_url
    let stateData: { 
      owner_id: string; 
      property_id?: string; 
      credential_id?: string;
      environment?: 'sandbox' | 'production';
      origin_url?: string;
    };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner_id, property_id, credential_id, environment = 'production' } = stateData;
    console.log('Parsed state:', { owner_id, property_id, credential_id, environment });

    // Get OAuth credentials
    const clientId = Deno.env.get('HOSTFULLY_CLIENT_ID');
    const clientSecret = Deno.env.get('HOSTFULLY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('Missing Hostfully OAuth credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'OAuth not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine URLs based on environment
    const tokenUrl = environment === 'sandbox'
      ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/code-exchange'
      : 'https://api.hostfully.com/api/auth/oauth/code-exchange';

    const appUrl = getAppUrl(state);
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/hostfully-oauth-callback`;

    // Exchange code for tokens using Basic Auth (per Hostfully docs)
    console.log('Exchanging code for tokens at:', tokenUrl);
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirectUri,
        scope: 'FULL',
        grantType: 'REFRESH_TOKEN',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token exchange successful, received tokens');

    const { accessToken, refreshToken, expiresIn } = tokenData;

    if (!accessToken) {
      throw new Error('No access token in response');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate token expiry (default 24h if not provided)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (expiresIn || 86400));

    // Store or update credentials in owner_pms_credentials
    if (credential_id) {
      // Update existing credential
      const { error: updateError } = await supabase
        .from('owner_pms_credentials')
        .update({
          api_key: accessToken,
          refresh_token: refreshToken,
          token_expires_at: expiresAt.toISOString(),
          environment,
          sync_status: 'connected',
          sync_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', credential_id);

      if (updateError) {
        console.error('Failed to update credential:', updateError);
        throw new Error('Failed to store credentials');
      }
    } else {
      // Create new credential
      const { error: insertError } = await supabase
        .from('owner_pms_credentials')
        .insert({
          owner_id,
          system_type: 'hostfully',
          api_key: accessToken,
          refresh_token: refreshToken,
          token_expires_at: expiresAt.toISOString(),
          environment,
          sync_status: 'connected',
          is_active: true,
        });

      if (insertError) {
        console.error('Failed to create credential:', insertError);
        throw new Error('Failed to store credentials');
      }
    }

    // If property_id provided, update property's PMS connection
    if (property_id) {
      const { error: propError } = await supabase
        .from('properties')
        .update({
          external_system: 'hostfully',
          pms_sync_status: 'connected',
          last_pms_sync_at: new Date().toISOString(),
        })
        .eq('id', property_id);

      if (propError) {
        console.warn('Failed to update property:', propError);
      }

      // Auto-ingest property data from Hostfully
      try {
        // First, get the property's Hostfully UID
        const { data: propData } = await supabase
          .from('properties')
          .select('hostfully_property_uid')
          .eq('id', property_id)
          .maybeSingle();

        if (propData?.hostfully_property_uid) {
          console.log('Starting auto-ingestion for property:', property_id);
          
          // Call hostfully-api to run full ingestion
          const ingestionResponse = await fetch(
            `${supabaseUrl}/functions/v1/hostfully-api`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                action: 'full_ingest_property',
                owner_credential_id: credential_id,
                propertyUid: propData.hostfully_property_uid,
                rol_property_id: property_id,
              }),
            }
          );

          const ingestionResult = await ingestionResponse.json();
          console.log('Auto-ingestion result:', ingestionResult.success ? 'success' : ingestionResult.error);
        } else {
          console.log('No hostfully_property_uid on property, skipping auto-ingestion');
        }
      } catch (ingestionErr) {
        // Don't fail the OAuth flow if ingestion fails - just log it
        console.warn('Auto-ingestion failed (non-blocking):', ingestionErr);
      }
    }

    console.log('OAuth flow completed successfully');

    // Redirect back to app with success
    const redirectPath = property_id 
      ? `/admin/properties/${property_id}?hostfully_connected=true`
      : '/admin/users?hostfully_connected=true';
    
    return Response.redirect(`${appUrl}${redirectPath}`, 302);

  } catch (err) {
    console.error('Error in hostfully-oauth-callback:', err);
    
    // Redirect with error
    const appUrl = getAppUrl(null);
    return Response.redirect(
      `${appUrl}/admin/users?hostfully_error=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`,
      302
    );
  }
});
