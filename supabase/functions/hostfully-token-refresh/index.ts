import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const clientId = Deno.env.get('HOSTFULLY_CLIENT_ID');
    const clientSecret = Deno.env.get('HOSTFULLY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Missing Hostfully OAuth credentials');
    }

    // Find credentials expiring within 1 hour
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

    const { data: credentials, error: fetchError } = await supabase
      .from('owner_pms_credentials')
      .select('*')
      .eq('system_type', 'hostfully')
      .eq('is_active', true)
      .not('refresh_token', 'is', null)
      .lt('token_expires_at', oneHourFromNow.toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch credentials: ${fetchError.message}`);
    }

    console.log(`Found ${credentials?.length || 0} credentials to refresh`);

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const credential of credentials || []) {
      try {
        const environment = credential.environment || 'production';
        const refreshUrl = environment === 'sandbox'
          ? 'https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/token-refresh'
          : 'https://pmp.hostfully.com/api/auth/oauth/token-refresh';

        const basicAuth = btoa(`${clientId}:${clientSecret}`);
        
        const response = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken: credential.refresh_token,
            scope: 'FULL',
            grantType: 'REFRESH_TOKEN',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
        }

        const tokenData = await response.json();
        const { accessToken, refreshToken, expiresIn } = tokenData;

        if (!accessToken) {
          throw new Error('No access token in refresh response');
        }

        // Calculate new expiry
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (expiresIn || 86400));

        // Update credential with new tokens
        const { error: updateError } = await supabase
          .from('owner_pms_credentials')
          .update({
            api_key: accessToken,
            refresh_token: refreshToken,
            token_expires_at: expiresAt.toISOString(),
            sync_status: 'connected',
            sync_error: null,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', credential.id);

        if (updateError) {
          throw new Error(`Failed to update credential: ${updateError.message}`);
        }

        console.log(`Successfully refreshed token for credential ${credential.id}`);
        results.push({ id: credential.id, success: true });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to refresh credential ${credential.id}:`, errorMessage);

        // Mark as token_expired
        await supabase
          .from('owner_pms_credentials')
          .update({
            sync_status: 'token_expired',
            sync_error: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', credential.id);

        results.push({ id: credential.id, success: false, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error in hostfully-token-refresh:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
