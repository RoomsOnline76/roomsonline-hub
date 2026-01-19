import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Rentals United API Integration
 * Status: In Development
 * 
 * Supported actions:
 * - health_check: Verify API connectivity and credentials
 * 
 * Future actions (planned):
 * - list_properties: Get available properties from Rentals United
 * - sync_listings: Deep sync of property data
 * - fetch_availability: Get availability and rates
 * - push_booking: Send bookings to Rentals United
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: string;
  property_id?: string;
  test_mode?: boolean;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, test_mode, metadata } = body;

    console.log(`[rentalsunited-api] Action: ${action}, test_mode: ${test_mode}`);

    // Handle health check
    if (action === 'health_check') {
      // Check if API credentials are configured
      const apiKey = Deno.env.get('RENTALS_UNITED_API_KEY');
      const username = Deno.env.get('RENTALS_UNITED_USERNAME');
      
      if (!apiKey && !username) {
        return new Response(
          JSON.stringify({
            healthy: false,
            status: 'not_configured',
            message: 'Rentals United credentials not configured',
            integration_status: 'in_development',
            metadata: {
              ...metadata,
              checked_at: new Date().toISOString(),
            },
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // In development - credentials exist but integration not complete
      return new Response(
        JSON.stringify({
          healthy: true,
          status: 'ok',
          message: 'Rentals United API credentials configured - integration in development',
          integration_status: 'in_development',
          capabilities: {
            health_check: true,
            list_properties: false,
            sync_listings: false,
            fetch_availability: false,
            push_booking: false,
          },
          metadata: {
            ...metadata,
            checked_at: new Date().toISOString(),
          },
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // All other actions - not yet implemented
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `Action "${action}" is not yet implemented for Rentals United`,
        },
        integration_status: 'in_development',
      }),
      { 
        status: 501, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[rentalsunited-api] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
