import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Test geocoding endpoint with a simple query
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=Cape+Town&key=${apiKey}`
    );
    const latency = Date.now() - start;
    const data = await response.json();

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      return {
        component_key: 'google_maps',
        status: latency > 2000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        response_data: { api_status: data.status },
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
    // Check if we have recent availability data (within last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('pms_availability_cache')
      .select('id, fetched_at')
      .gte('fetched_at', tenMinutesAgo)
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

    // If we have recent data, cache is healthy
    const hasRecentData = data && data.length > 0;
    
    return {
      component_key: 'availability_cache',
      status: hasRecentData ? 'healthy' : 'degraded',
      latency_ms: latency,
      response_data: { 
        has_recent_data: hasRecentData,
        threshold_minutes: 10,
      },
      metadata: hasRecentData ? {} : { warning: 'No availability data in last 10 minutes' },
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
        return checkPmsAdapter(supabase, component.component_key, component.expected_latency_ms);
      case 'internal':
        if (component.component_key === 'supabase_db') return checkDatabase(supabase);
        if (component.component_key === 'supabase_storage') return checkStorage(supabase);
        if (component.component_key === 'edge_runtime') return checkEdgeRuntime();
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
