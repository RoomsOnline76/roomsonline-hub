import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOSTFULLY_TOKEN_URL = 'https://pmp.hostfully.com/api/auth/oauth/code-exchange';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // Contains owner_id
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    console.log('Hostfully OAuth callback received:', {
      hasCode: !!code,
      hasState: !!state,
      error,
      errorDescription,
    });

    // Handle OAuth errors - redirect back to app with error
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      const appUrl = Deno.env.get('APP_URL') || 'https://roomsonline.co.za';
      return Response.redirect(
        `${appUrl}/admin/users?hostfully_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
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

    // Parse state - contains owner_id and optional property_id
    let stateData: { owner_id: string; property_id?: string; credential_id?: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { owner_id, property_id, credential_id } = stateData;
    console.log('Parsed state:', { owner_id, property_id, credential_id });

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

    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const tokenResponse = await fetch(HOSTFULLY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        code,
        grantType: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
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

    // Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (expiresIn || 86400)); // Default 24h

    // Store or update credentials in owner_pms_credentials
    if (credential_id) {
      // Update existing credential
      const { error: updateError } = await supabase
        .from('owner_pms_credentials')
        .update({
          api_key: accessToken, // Store access token as api_key for compatibility
          sync_status: 'connected',
          sync_error: null,
          updated_at: new Date().toISOString(),
          // Store refresh token and expiry in a metadata field or separate columns if needed
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
          environment: 'production',
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
    }

    console.log('OAuth flow completed successfully');

    // Redirect back to app with success
    const appUrl = Deno.env.get('APP_URL') || 'https://roomsonline.co.za';
    const redirectPath = property_id 
      ? `/admin/properties/${property_id}?hostfully_connected=true`
      : '/admin/users?hostfully_connected=true';
    
    return Response.redirect(`${appUrl}${redirectPath}`, 302);

  } catch (err) {
    console.error('Error in hostfully-oauth-callback:', err);
    
    // Redirect with error
    const appUrl = Deno.env.get('APP_URL') || 'https://roomsonline.co.za';
    return Response.redirect(
      `${appUrl}/admin/users?hostfully_error=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`,
      302
    );
  }
});
