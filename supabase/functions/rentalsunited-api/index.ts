import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Rentals United XML API Adapter
 * 
 * Supported actions:
 * - health_check: Verify API connectivity and credentials
 * - list_properties: Pull_ListOwnerProp_RQ
 * - get_property: Pull_ListSpecProp_RQ
 * - get_availability: Pull_ListPropertyAvailabilityCalendar_RQ
 * - get_prices: Pull_ListPropertyPrices_RQ
 * - list_reservations: Pull_ListReservations_RQ
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RequestBody {
  action: string;
  property_id?: string;
  ru_property_id?: number;
  date_from?: string;
  date_to?: string;
  test_mode?: boolean;
  metadata?: Record<string, unknown>;
}

interface RUCredentials {
  username: string;
  password: string;
  endpoint: string;
}

// ── XML Helpers ──────────────────────────────────────────────

function buildAuthXml(creds: RUCredentials): string {
  return `<Authentication>
    <UserName>${escapeXml(creds.username)}</UserName>
    <Password>${escapeXml(creds.password)}</Password>
  </Authentication>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractStatusId(xml: string): { id: string; message: string } {
  const idMatch = xml.match(/<Status\s+ID="(\d+)"/);
  const msgMatch = xml.match(/<Status[^>]*>(.*?)<\/Status>/s);
  return {
    id: idMatch?.[1] || '0',
    message: msgMatch?.[1]?.trim() || 'Unknown',
  };
}

function extractSimpleElements(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'gs');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractAttribute(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'g');
  const match = regex.exec(xml);
  return match?.[1] || null;
}

function extractPropertyIds(xml: string): { id: string; name: string }[] {
  const regex = /<Property\s+ID="(\d+)"[^>]*>[\s\S]*?<Name>(.*?)<\/Name>/g;
  const results: { id: string; name: string }[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push({ id: match[1], name: match[2].trim() });
  }
  return results;
}

// ── API Call Helper ──────────────────────────────────────────

async function callRentalsUnited(creds: RUCredentials, xmlBody: string): Promise<string> {
  const response = await fetch(creds.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  });

  if (!response.ok) {
    throw new Error(`RU API returned HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.text();
}

// ── Credential Loader ────────────────────────────────────────

async function loadCredentials(): Promise<RUCredentials | null> {
  // First try env vars
  const envUsername = Deno.env.get('RENTALS_UNITED_USERNAME');
  const envPassword = Deno.env.get('RENTALS_UNITED_API_KEY');

  if (envUsername && envPassword) {
    return {
      username: envUsername,
      password: envPassword,
      endpoint: Deno.env.get('RENTALS_UNITED_ENDPOINT') || 'https://rm.rentalsunited.com/api/Handler.ashx',
    };
  }

  // Fall back to pms_credentials table
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('pms_credentials')
      .select('username, api_key, base_url')
      .eq('system_type', 'rentalsunited')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    return {
      username: data.username || '',
      password: data.api_key || '',
      endpoint: data.base_url || 'https://rm.rentalsunited.com/api/Handler.ashx',
    };
  } catch {
    return null;
  }
}

// ── XML Request Builders ─────────────────────────────────────

function buildHealthCheckXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListOwnerProp_RQ>
  ${buildAuthXml(creds)}
</Pull_ListOwnerProp_RQ>`;
}

function buildListPropertiesXml(creds: RUCredentials): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListOwnerProp_RQ>
  ${buildAuthXml(creds)}
</Pull_ListOwnerProp_RQ>`;
}

function buildGetPropertyXml(creds: RUCredentials, propertyId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListSpecProp_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
</Pull_ListSpecProp_RQ>`;
}

function buildGetAvailabilityXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyAvailabilityCalendar_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListPropertyAvailabilityCalendar_RQ>`;
}

function buildGetPricesXml(creds: RUCredentials, propertyId: number, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListPropertyPrices_RQ>
  ${buildAuthXml(creds)}
  <PropertyID>${propertyId}</PropertyID>
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListPropertyPrices_RQ>`;
}

function buildListReservationsXml(creds: RUCredentials, dateFrom: string, dateTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Pull_ListReservations_RQ>
  ${buildAuthXml(creds)}
  <DateFrom>${dateFrom}</DateFrom>
  <DateTo>${dateTo}</DateTo>
</Pull_ListReservations_RQ>`;
}

// ── Main Handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, ru_property_id, date_from, date_to, test_mode, metadata } = body;

    console.log(`[rentalsunited-api] Action: ${action}, test_mode: ${test_mode}`);

    const creds = await loadCredentials();

    // ── health_check ──
    if (action === 'health_check') {
      if (!creds || (!creds.username && !creds.password)) {
        return new Response(
          JSON.stringify({
            healthy: false,
            status: 'not_configured',
            message: 'Rentals United credentials not configured',
            integration_status: 'in_development',
            metadata: { ...metadata, checked_at: new Date().toISOString() },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const xml = buildHealthCheckXml(creds);
        const response = await callRentalsUnited(creds, xml);
        const status = extractStatusId(response);
        const isHealthy = status.id === '0';

        return new Response(
          JSON.stringify({
            healthy: isHealthy,
            status: isHealthy ? 'ok' : 'error',
            message: isHealthy
              ? 'Rentals United API connected successfully'
              : `Rentals United API error: ${status.message}`,
            ru_status_id: status.id,
            ru_status_message: status.message,
            integration_status: 'in_development',
            capabilities: {
              health_check: true,
              list_properties: true,
              get_property: true,
              get_availability: true,
              get_prices: true,
              list_reservations: true,
            },
            metadata: { ...metadata, checked_at: new Date().toISOString() },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            healthy: false,
            status: 'connection_error',
            message: `Could not reach Rentals United: ${err instanceof Error ? err.message : 'Unknown error'}`,
            metadata: { ...metadata, checked_at: new Date().toISOString() },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // All other actions require credentials
    if (!creds || !creds.username || !creds.password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'NOT_CONFIGURED', message: 'Rentals United credentials not configured' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── list_properties ──
    if (action === 'list_properties') {
      const xml = buildListPropertiesXml(creds);
      const response = await callRentalsUnited(creds, xml);
      const status = extractStatusId(response);

      if (status.id !== '0') {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const properties = extractPropertyIds(response);
      return new Response(
        JSON.stringify({ success: true, properties, count: properties.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_property ──
    if (action === 'get_property') {
      if (!ru_property_id) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'ru_property_id is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xml = buildGetPropertyXml(creds, ru_property_id);
      const response = await callRentalsUnited(creds, xml);
      const status = extractStatusId(response);

      if (status.id !== '0') {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, raw_xml: response }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_availability ──
    if (action === 'get_availability') {
      if (!ru_property_id || !date_from || !date_to) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'ru_property_id, date_from, date_to are required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xml = buildGetAvailabilityXml(creds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const status = extractStatusId(response);

      if (status.id !== '0') {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, raw_xml: response }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_prices ──
    if (action === 'get_prices') {
      if (!ru_property_id || !date_from || !date_to) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'ru_property_id, date_from, date_to are required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xml = buildGetPricesXml(creds, ru_property_id, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const status = extractStatusId(response);

      if (status.id !== '0') {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, raw_xml: response }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── list_reservations ──
    if (action === 'list_reservations') {
      if (!date_from || !date_to) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'date_from and date_to are required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const xml = buildListReservationsXml(creds, date_from, date_to);
      const response = await callRentalsUnited(creds, xml);
      const status = extractStatusId(response);

      if (status.id !== '0') {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'RU_ERROR', message: status.message, ru_status_id: status.id } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, raw_xml: response }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'UNKNOWN_ACTION', message: `Action "${action}" is not supported` },
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
