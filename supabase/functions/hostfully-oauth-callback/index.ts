import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    console.log('Hostfully OAuth callback received:', {
      hasCode: !!code,
      hasState: !!state,
      error,
      errorDescription,
    });

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error, 
          error_description: errorDescription 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Placeholder for OAuth token exchange - to be implemented
    if (code) {
      console.log('Authorization code received, ready for token exchange');
      
      // TODO: Exchange code for access token
      // TODO: Store credentials in owner_pms_credentials
      // TODO: Redirect user back to app
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'OAuth callback received. Token exchange pending implementation.',
          code: code.substring(0, 10) + '...',
          state 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'No authorization code provided' 
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (err) {
    console.error('Error in hostfully-oauth-callback:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
