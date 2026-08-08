import { createClient } from 'npm:@supabase/supabase-js@2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
  component_key: string;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  latency_ms: number;
  error_code?: string;
  error_message?: string;
  response_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface Component {
  component_key: string;
  component_type: string;
  health_check_endpoint: string;
  expected_latency_ms: number;
  is_critical: boolean;
}

// PMS adapters and their health check configurations
const PMS_ADAPTERS: Record<string, { function_name: string }> = {
  'benson': { function_name: 'benson-api' },
  'checkfront': { function_name: 'checkfront-api' },
  'cloudbeds': { function_name: 'cloudbeds-api' },
  'hostfully': { function_name: 'hostfully-api' },
  'hotelbeds': { function_name: 'hotelbeds-api' },
  'littlehotelier': { function_name: 'little-hotelier-api' },
  'rentalsunited': { function_name: 'rentalsunited-api' },
  'roomsonline_pms': { function_name: 'roomsonline-pms-api' },
};

async function checkPmsAdapter(
  supabase: SupabaseClientType,
  componentKey: string,
  expectedLatency: number
): Promise<HealthCheckResult> {
  const adapter = PMS_ADAPTERS[componentKey];
  if (!adapter) {
    return {
      component_key: componentKey,
      status: 'unknown',
      latency_ms: 0,
      error_message: 'Unknown PMS adapter',
    };
  }

  const start = Date.now();
  try {
    const { data, error } = await supabase.functions.invoke(adapter.function_name, {
      body: {
        action: 'health_check',
        test_mode: true,
        // property_id omitted for standalone health check (Zod .optional() fails on explicit null)
        metadata: { source: 'system_health_check', timestamp: new Date().toISOString() }
      },
    });

    const latency = Date.now() - start;
    
    if (error) {
      return {
        component_key: componentKey,
        status: 'failed',
        latency_ms: latency,
        error_code: 'INVOKE_ERROR',
        error_message: error.message,
      };
    }

    // Check if the adapter returned a healthy status
    const isHealthy = data?.healthy === true || data?.status === 'ok' || data?.success === true;
    const isDegraded = latency > expectedLatency;

    return {
      component_key: componentKey,
      status: isHealthy ? (isDegraded ? 'degraded' : 'healthy') : 'failed',
      latency_ms: latency,
      response_data: data,
      metadata: { expected_latency_ms: expectedLatency },
    };
  } catch (err) {
    return {
      component_key: componentKey,
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Rentals United is the channel manager behind every ROL'OS distribution flow, so it gets a
 * deeper check than a plain adapter ping: the adapter must answer AND the live sync stream
 * (ARI push / reservation pull) must be fresh. A reachable adapter with a stale ARI clock is
 * a silent outage for the channels, so it grades degraded rather than healthy.
 */
const RU_ARI_MAX_AGE_HOURS = 8;
const RU_RESERVATION_MAX_AGE_HOURS = 2;

async function checkRentalsUnited(
  supabase: SupabaseClientType,
  expectedLatency: number,
): Promise<HealthCheckResult> {
  const adapter = await checkPmsAdapter(supabase, 'rentalsunited', expectedLatency);
  // Rentals United enforces one call per method per sliding minute, so the probe can collide
  // with a live cron pull. A rate-limit answer proves the endpoint is reachable — never treat
  // it as an outage; fall through to the sync-freshness evidence instead.
  const probe = (adapter.response_data ?? {}) as { ru_status_id?: string; message?: string };
  const rateLimited =
    probe.ru_status_id === '-6' || /rate limited/i.test(probe.message ?? '');
  if (adapter.status === 'failed' && !rateLimited) return adapter;


  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: runs } = await supabase
    .from('ru_sync_runs')
    .select('action, success, property_id, details, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  const rows = (runs ?? []) as Array<{
    action: string;
    success: boolean;
    property_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }>;
  // A "skipped" run (property not listed on the channel yet, listing retired) proves the
  // adapter ran but is not evidence of a live sync — never let it reset a freshness clock.
  const realRuns = rows.filter((r) => r.success && !(r.details as { skipped?: boolean } | null)?.skipped);

  const ageHours = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : null);
  const newest = (actions: string[]) =>
    realRuns.find((r) => actions.includes(r.action))?.created_at;

  const ariAt = newest(['refresh_ari', 'inventory_push', 'push_availability', 'push_prices']);
  const resAt = newest(['list_reservations', 'pull_reservations']);
  const ariAge = ageHours(ariAt);
  const resAge = ageHours(resAt);
  const liveProperties = new Set(realRuns.map((r) => r.property_id).filter(Boolean)).size;
  const failed24h = rows.filter(
    (r) => !r.success && Date.now() - new Date(r.created_at).getTime() < 86_400_000,
  ).length;

  const warnings: string[] = [];
  if (ariAge == null || ariAge > RU_ARI_MAX_AGE_HOURS) {
    warnings.push(
      ariAge == null
        ? 'no successful availability/pricing push in the last 7 days'
        : `availability/pricing last pushed ${ariAge.toFixed(1)}h ago (limit ${RU_ARI_MAX_AGE_HOURS}h)`,
    );
  }
  if (resAge == null || resAge > RU_RESERVATION_MAX_AGE_HOURS) {
    warnings.push(
      resAge == null
        ? 'no successful reservation pull in the last 7 days'
        : `reservations last pulled ${resAge.toFixed(1)}h ago (limit ${RU_RESERVATION_MAX_AGE_HOURS}h)`,
    );
  }

  return {
    component_key: 'rentalsunited',
    status: warnings.length ? 'degraded' : adapter.status,
    latency_ms: adapter.latency_ms,
    error_code: warnings.length ? 'SYNC_STALE' : undefined,
    error_message: warnings.length ? `Channel manager sync stale — ${warnings.join('; ')}.` : undefined,
    response_data: {
      live_properties: liveProperties,
      last_ari_push_at: ariAt ?? null,
      last_reservation_pull_at: resAt ?? null,
      failed_runs_24h: failed24h,
    },
    metadata: {
      ari_max_age_hours: RU_ARI_MAX_AGE_HOURS,
      reservation_max_age_hours: RU_RESERVATION_MAX_AGE_HOURS,
      note: 'Critical: drives all ROL\'OS channel distribution',
    },
  };
}

/** ROL'OS internal REST API — graded on its own request log plus a live adapter ping. */
async function checkRoomsOnlineApi(supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const ping = await checkPmsAdapter(supabase, 'roomsonline_pms', 5000);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: logs } = await supabase
    .from('api_request_log')
    .select('status_code, response_time_ms')
    .gte('created_at', since)
    .limit(2000);

  const rows = (logs ?? []) as Array<{ status_code: number | null; response_time_ms: number | null }>;
  const calls = rows.length;
  const errors = rows.filter((r) => (r.status_code ?? 200) >= 500).length;
  const clientErrors = rows.filter((r) => (r.status_code ?? 200) >= 400 && (r.status_code ?? 200) < 500).length;
  const latencies = rows.map((r) => r.response_time_ms).filter((v): v is number => !!v);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : ping.latency_ms;
  const errorRate = calls ? (errors / calls) * 100 : 0;

  let status: HealthCheckResult['status'] = ping.status === 'failed' ? 'failed' : 'healthy';
  let error_message: string | undefined;
  if (status !== 'failed' && errorRate > 2) {
    status = 'degraded';
    error_message = `${errors} server error(s) across ${calls} calls in 24h (${errorRate.toFixed(1)}%).`;
  } else if (status !== 'failed' && avgLatency > 3000) {
    status = 'degraded';
    error_message = `Average response time ${avgLatency}ms over 24h.`;
  }

  return {
    component_key: 'roomsonline',
    status,
    latency_ms: avgLatency,
    error_code: status === 'degraded' ? 'API_DEGRADED' : ping.error_code,
    error_message: error_message ?? (status === 'failed' ? ping.error_message : undefined),
    response_data: { calls_24h: calls, server_errors_24h: errors, client_errors_24h: clientErrors, avg_latency_ms: avgLatency },
  };
}


async function checkDatabase(supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('properties').select('id').limit(1);
    const latency = Date.now() - start;
    
    if (error) {
      return {
        component_key: 'supabase_db',
        status: 'failed',
        latency_ms: latency,
        error_code: 'DB_ERROR',
        error_message: error.message,
      };
    }

    return {
      component_key: 'supabase_db',
      status: latency > 1000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      response_data: { query: 'SELECT id FROM properties LIMIT 1' },
    };
  } catch (err) {
    return {
      component_key: 'supabase_db',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkStorage(supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.storage.listBuckets();
    const latency = Date.now() - start;
    
    if (error) {
      return {
        component_key: 'supabase_storage',
        status: 'failed',
        latency_ms: latency,
        error_code: 'STORAGE_ERROR',
        error_message: error.message,
      };
    }

    return {
      component_key: 'supabase_storage',
      status: latency > 2000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      response_data: { bucket_count: data?.length || 0 },
    };
  } catch (err) {
    return {
      component_key: 'supabase_storage',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkEdgeRuntime(): Promise<HealthCheckResult> {
  // If this function is running, edge runtime is healthy
  const start = Date.now();
  return {
    component_key: 'edge_runtime',
    status: 'healthy',
    latency_ms: Date.now() - start,
    response_data: { message: 'Edge function executing successfully' },
  };
}

async function checkResendEmail(): Promise<HealthCheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('RESEND_API_KEY');
  
  if (!apiKey) {
    return {
      component_key: 'resend_email',
      status: 'failed',
      latency_ms: 0,
      error_code: 'NO_API_KEY',
      error_message: 'RESEND_API_KEY not configured',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const latency = Date.now() - start;

    if (!response.ok) {
      return {
        component_key: 'resend_email',
        status: 'failed',
        latency_ms: latency,
        error_code: `HTTP_${response.status}`,
        error_message: `Resend API returned ${response.status}`,
      };
    }

    return {
      component_key: 'resend_email',
      status: latency > 3000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      response_data: { api_status: 'ok' },
    };
  } catch (err) {
    return {
      component_key: 'resend_email',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkPayFast(): Promise<HealthCheckResult> {
  const start = Date.now();
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID');
  const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY');
  
  if (!merchantId || !merchantKey) {
    return {
      component_key: 'payfast_gateway',
      status: 'unknown',
      latency_ms: 0,
      error_code: 'NO_CREDENTIALS',
      error_message: 'PayFast credentials not configured',
      metadata: { note: 'Cannot verify without credentials' },
    };
  }

  // PayFast doesn't have a simple health check endpoint, verify credentials exist
  return {
    component_key: 'payfast_gateway',
    status: 'healthy',
    latency_ms: Date.now() - start,
    response_data: { credentials_configured: true },
    metadata: { 
      note: 'Credentials verified',
      sandbox: Deno.env.get('PAYFAST_SANDBOX') !== 'false',
    },
  };
}

async function checkGoogleMaps(_supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Use server-side API key from secrets (not the referer-restricted frontend key)
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!apiKey) {
      return {
        component_key: 'google_maps',
        status: 'unknown',
        latency_ms: Date.now() - start,
        error_code: 'NO_API_KEY',
        error_message: 'Google Maps API key not configured in secrets',
      };
    }

    const geocode = (referer?: string) =>
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Cape+Town&key=${apiKey}`, {
        headers: referer ? { Referer: referer } : undefined,
      });

    // Test geocoding endpoint with a simple query
    let response = await geocode();
    let data = await response.json();

    // The stored key may be HTTP-referrer restricted (browser key). Retry once presenting the
    // production origin so a correctly restricted key still verifies instead of alarming.
    if (data.status === 'REQUEST_DENIED') {
      response = await geocode('https://sleepinafrica.roomsonline.co.za/');
      data = await response.json();
    }

    const latency = Date.now() - start;

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      return {
        component_key: 'google_maps',
        status: latency > 2000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        response_data: { api_status: data.status },
      };
    }

    // A referrer-restricted key is a configuration gap, not a Google outage: report it as
    // degraded with an actionable message so it never shows as a red platform failure.
    if (data.status === 'REQUEST_DENIED') {
      return {
        component_key: 'google_maps',
        status: 'degraded',
        latency_ms: latency,
        error_code: 'KEY_RESTRICTED',
        error_message:
          'Maps key is HTTP-referrer restricted, so server-side geocoding cannot verify it. Add an unrestricted (IP/server) Maps key to enable full monitoring — front-end maps are unaffected.',
        response_data: { api_status: data.status, google_message: data.error_message ?? null },
      };
    }

    return {
      component_key: 'google_maps',
      status: 'failed',
      latency_ms: latency,
      error_code: data.status,
      error_message: data.error_message || 'Google Maps API error',
    };

  } catch (err) {
    return {
      component_key: 'google_maps',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkTripAdvisor(): Promise<HealthCheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('TRIPADVISOR_API_KEY');
  
  if (!apiKey) {
    return {
      component_key: 'tripadvisor',
      status: 'unknown',
      latency_ms: 0,
      error_code: 'NO_API_KEY',
      error_message: 'TripAdvisor API key not configured',
    };
  }

  // TripAdvisor API key exists, mark as healthy (no free health check endpoint)
  return {
    component_key: 'tripadvisor',
    status: 'healthy',
    latency_ms: Date.now() - start,
    response_data: { credentials_configured: true },
    metadata: { note: 'Credentials verified' },
  };
}

async function checkBookingEngine(supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    // Test push-booking with dry_run mode
    const { data, error } = await supabase.functions.invoke('push-booking', {
      body: {
        dry_run: true,
        test_mode: true,
        metadata: { source: 'system_health_check' },
      },
    });
    const latency = Date.now() - start;

    if (error) {
      // Some errors are expected in dry_run mode (e.g., missing required fields)
      // We just want to verify the function is responding
      if (error.message?.includes('timeout') || error.message?.includes('unavailable')) {
        return {
          component_key: 'booking_engine',
          status: 'failed',
          latency_ms: latency,
          error_code: 'FUNCTION_UNAVAILABLE',
          error_message: error.message,
        };
      }
    }

    return {
      component_key: 'booking_engine',
      status: latency > 5000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      response_data: { function_responding: true, dry_run: true },
    };
  } catch (err) {
    return {
      component_key: 'booking_engine',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkAvailabilityCache(supabase: SupabaseClientType): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    // The cache is an accelerator only — checkout always resolves live (NO_BOOKING_FROM_CACHE),
    // so grade it on staleness over a realistic window instead of a 10-minute tripwire.
    const FRESH_HOURS = 6;
    const STALE_HOURS = 24;

    const { data, error } = await supabase
      .from('pms_availability_cache')
      .select('id, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1);

    const latency = Date.now() - start;

    if (error) {
      return {
        component_key: 'availability_cache',
        status: 'failed',
        latency_ms: latency,
        error_code: 'DB_ERROR',
        error_message: error.message,
      };
    }

    const lastFetchedAt = data?.[0]?.fetched_at as string | undefined;
    const ageHours = lastFetchedAt ? (Date.now() - new Date(lastFetchedAt).getTime()) / 3600000 : null;

    // No rows at all means every property is resolving live — a valid operating mode.
    if (ageHours === null) {
      return {
        component_key: 'availability_cache',
        status: 'healthy',
        latency_ms: latency,
        response_data: { entries: 0, mode: 'live_only' },
        metadata: { note: 'Cache empty — availability resolving live (NO_BOOKING_FROM_CACHE)' },
      };
    }

    const status = ageHours <= FRESH_HOURS ? 'healthy' : ageHours <= STALE_HOURS ? 'degraded' : 'failed';

    return {
      component_key: 'availability_cache',
      status,
      latency_ms: latency,
      error_code: status === 'healthy' ? undefined : 'CACHE_STALE',
      error_message:
        status === 'healthy'
          ? undefined
          : `Newest cached availability is ${ageHours.toFixed(1)}h old (fresh under ${FRESH_HOURS}h).`,
      response_data: {
        last_fetched_at: lastFetchedAt,
        age_hours: Number(ageHours.toFixed(2)),
        fresh_threshold_hours: FRESH_HOURS,
      },
    };
  } catch (err) {
    return {
      component_key: 'availability_cache',
      status: 'failed',
      latency_ms: Date.now() - start,
      error_code: 'EXCEPTION',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function runHealthCheck(
  supabase: SupabaseClientType,
  component: Component
): Promise<HealthCheckResult> {
  const timeout = 30000; // 30 second timeout per check
  
  const checkPromise = (async () => {
    switch (component.component_type) {
      case 'pms':
        if (component.component_key === 'rentalsunited')
          return checkRentalsUnited(supabase, component.expected_latency_ms);
        return checkPmsAdapter(supabase, component.component_key, component.expected_latency_ms);
      case 'internal':
        if (component.component_key === 'supabase_db') return checkDatabase(supabase);
        if (component.component_key === 'supabase_storage') return checkStorage(supabase);
        if (component.component_key === 'edge_runtime') return checkEdgeRuntime();
        if (component.component_key === 'roomsonline') return checkRoomsOnlineApi(supabase);
        break;

      case 'external':
        if (component.component_key === 'resend_email') return checkResendEmail();
        if (component.component_key === 'payfast_gateway') return checkPayFast();
        if (component.component_key === 'google_maps') return checkGoogleMaps(supabase);
        if (component.component_key === 'tripadvisor') return checkTripAdvisor();
        break;
      case 'infrastructure':
        if (component.component_key === 'booking_engine') return checkBookingEngine(supabase);
        if (component.component_key === 'availability_cache') return checkAvailabilityCache(supabase);
        break;
    }
    
    return {
      component_key: component.component_key,
      status: 'unknown' as const,
      latency_ms: 0,
      error_message: 'No health check implemented for this component',
    };
  })();

  // Apply timeout
  const timeoutPromise = new Promise<HealthCheckResult>((resolve) => {
    setTimeout(() => {
      resolve({
        component_key: component.component_key,
        status: 'failed',
        latency_ms: timeout,
        error_code: 'TIMEOUT',
        error_message: `Health check timed out after ${timeout}ms`,
      });
    }, timeout);
  });

  return Promise.race([checkPromise, timeoutPromise]);
}

// Helper to get active PMS systems from pms_credentials
async function getActivePmsSystems(supabase: SupabaseClientType): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pms_credentials')
    .select('system_type')
    .eq('is_active', true);
  
  if (error || !data) {
    console.warn('[Health Check] Could not fetch active PMS credentials:', error?.message);
    return new Set<string>();
  }
  
  const activeTypes = new Set<string>(data.map((cred: { system_type: string }) => cred.system_type));
  console.log(`[Health Check] Active PMS systems: ${Array.from(activeTypes).join(', ') || 'none'}`);
  return activeTypes;
}

// Helper to get parked PMS systems from pms_tracker_status (excluded from health checks)
async function getParkedPmsSystems(supabase: SupabaseClientType): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pms_tracker_status')
    .select('system_type')
    .eq('integration_status', 'parked');

  if (error || !data) {
    console.warn('[Health Check] Could not fetch parked PMS list:', error?.message);
    return new Set<string>();
  }

  const parked = new Set<string>(data.map((row: { system_type: string }) => row.system_type));
  if (parked.size) console.log(`[Health Check] Parked PMS (skipped): ${Array.from(parked).join(', ')}`);
  return parked;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Health Check] Starting system health check...');

    // Fetch all active components
    const { data: components, error: fetchError } = await supabase
      .from('system_health_components')
      .select('*')
      .eq('is_active', true);

    if (fetchError) {
      console.error('[Health Check] Failed to fetch components:', fetchError);
      throw new Error(`Failed to fetch components: ${fetchError.message}`);
    }

    if (!components || components.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active components to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get active PMS systems from pms_credentials
    const activePmsSystems = await getActivePmsSystems(supabase);
    // Get parked PMS systems from pms_tracker_status (always skipped)
    const parkedPmsSystems = await getParkedPmsSystems(supabase);

    // Filter components: keep all non-PMS, skip parked PMS, only keep PMS with active credentials
    const componentsToCheck = (components || []).filter((component: Component) => {
      if (component.component_type !== 'pms') {
        return true;
      }
      if (parkedPmsSystems.has(component.component_key)) {
        console.log(`[Health Check] Skipping ${component.component_key} - parked`);
        return false;
      }
      const isActive = activePmsSystems.has(component.component_key);
      if (!isActive) {
        console.log(`[Health Check] Skipping ${component.component_key} - no active credentials`);
      }
      return isActive;
    });


    const skippedCount = (components?.length || 0) - componentsToCheck.length;
    console.log(`[Health Check] Checking ${componentsToCheck.length} components (${skippedCount} PMS skipped)...`);

    // Run all health checks in parallel
    const results = await Promise.all(
      componentsToCheck.map((component: Component) => runHealthCheck(supabase, component))
    );

    const checkedAt = new Date().toISOString();

    // Insert all results into system_health_checks
    const checksToInsert = results.map((result) => ({
      component_key: result.component_key,
      status: result.status,
      latency_ms: result.latency_ms,
      error_code: result.error_code || null,
      error_message: result.error_message || null,
      response_data: result.response_data || null,
      metadata: result.metadata || {},
      checked_at: checkedAt,
    }));

    const { error: insertError } = await supabase
      .from('system_health_checks')
      .insert(checksToInsert);

    if (insertError) {
      console.error('[Health Check] Failed to insert results:', insertError);
      // Don't throw - we still want to return the results
    }

    // Calculate summary
    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      failed: results.filter((r) => r.status === 'failed').length,
      unknown: results.filter((r) => r.status === 'unknown').length,
    };

    const criticalComponents = components.filter((c) => c.is_critical);
    const criticalResults = results.filter((r) => 
      criticalComponents.some((c) => c.component_key === r.component_key)
    );
    const criticalFailed = criticalResults.filter((r) => r.status === 'failed');

    const overallStatus = criticalFailed.length > 0 
      ? 'critical' 
      : summary.failed > 0 
        ? 'degraded' 
        : summary.degraded > 0 
          ? 'warning' 
          : 'healthy';

    console.log(`[Health Check] Complete. Status: ${overallStatus}`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        checked_at: checkedAt,
        overall_status: overallStatus,
        summary,
        results,
        critical_failures: criticalFailed.map((r) => ({
          component: r.component_key,
          error: r.error_message,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Health Check] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
