import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnomalyDetectionResult {
  type: 'rate_drift' | 'sync_failure' | 'conversion_drop' | 'latency_spike' | 'availability_issue' | 'booking_anomaly';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  component_key?: string;
  property_id?: string;
  metadata: Record<string, unknown>;
}

interface BookingStats {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  failed: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectRateDrift(supabase: any): Promise<AnomalyDetectionResult[]> {
  const anomalies: AnomalyDetectionResult[] = [];
  
  try {
    // Get active properties with rate types
    const { data: properties } = await supabase
      .from('properties')
      .select('id, name, rate_types')
      .eq('is_active', true)
      .not('rate_types', 'is', null);

    if (!properties?.length) return anomalies;

    for (const property of properties) {
      const rateTypes = property.rate_types as Array<{ name: string; baseRate?: number; rate?: number }>;
      if (!rateTypes?.length) continue;

      // Check for unusually high or low rates
      for (const rateType of rateTypes) {
        const rate = rateType.baseRate || rateType.rate || 0;
        if (rate < 100) {
          anomalies.push({
            type: 'rate_drift',
            severity: 'warning',
            title: 'Unusually Low Rate Detected',
            message: `${property.name} has rate "${rateType.name}" at R${rate}/night, which seems low`,
            property_id: property.id,
            metadata: { rate_type: rateType.name, current_rate: rate },
          });
        } else if (rate > 50000) {
          anomalies.push({
            type: 'rate_drift',
            severity: 'warning',
            title: 'Unusually High Rate Detected',
            message: `${property.name} has rate "${rateType.name}" at R${rate}/night, which seems high`,
            property_id: property.id,
            metadata: { rate_type: rateType.name, current_rate: rate },
          });
        }
      }
    }
  } catch (error) {
    console.error('[Monitor] Rate drift detection error:', error);
  }

  return anomalies;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectSyncFailures(supabase: any): Promise<AnomalyDetectionResult[]> {
  const anomalies: AnomalyDetectionResult[] = [];
  
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Check for consecutive sync failures in health checks
    const { data: healthChecks } = await supabase
      .from('system_health_checks')
      .select('component_key, status, error_message, checked_at')
      .eq('status', 'failed')
      .gte('checked_at', oneDayAgo)
      .order('checked_at', { ascending: false });

    if (!healthChecks?.length) return anomalies;

    // Group by component
    const failuresByComponent: Record<string, Array<{
      component_key: string;
      status: string;
      error_message: string | null;
      checked_at: string;
    }>> = {};
    
    for (const check of healthChecks) {
      if (!failuresByComponent[check.component_key]) {
        failuresByComponent[check.component_key] = [];
      }
      failuresByComponent[check.component_key].push(check);
    }

    // Alert if 3+ consecutive failures
    for (const [componentKey, failures] of Object.entries(failuresByComponent)) {
      if (failures.length >= 3) {
        const latestError = failures[0]?.error_message || 'Unknown error';
        anomalies.push({
          type: 'sync_failure',
          severity: failures.length >= 5 ? 'critical' : 'warning',
          title: 'Multiple Sync Failures Detected',
          message: `${componentKey} has failed ${failures.length} times in the last 24 hours. Latest: ${latestError}`,
          component_key: componentKey,
          metadata: { 
            failure_count: failures.length, 
            last_error: latestError,
            first_failure: failures[failures.length - 1]?.checked_at,
          },
        });
      }
    }
  } catch (error) {
    console.error('[Monitor] Sync failure detection error:', error);
  }

  return anomalies;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectBookingAnomalies(supabase: any): Promise<AnomalyDetectionResult[]> {
  const anomalies: AnomalyDetectionResult[] = [];
  
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get bookings from last 24h
    const { data: recentBookings } = await supabase
      .from('bookings')
      .select('id, status, created_at')
      .gte('created_at', oneDayAgo.toISOString());

    // Get bookings from previous 24h for comparison
    const { data: previousBookings } = await supabase
      .from('bookings')
      .select('id, status, created_at')
      .gte('created_at', twoDaysAgo.toISOString())
      .lt('created_at', oneDayAgo.toISOString());

    const recentList = (recentBookings || []) as Array<{ id: string; status: string; created_at: string }>;
    const previousList = (previousBookings || []) as Array<{ id: string; status: string; created_at: string }>;

    const recentStats: BookingStats = {
      total: recentList.length,
      confirmed: recentList.filter(b => b.status === 'confirmed').length,
      pending: recentList.filter(b => b.status === 'pending').length,
      cancelled: recentList.filter(b => b.status === 'cancelled').length,
      failed: recentList.filter(b => b.status === 'failed').length,
    };

    const previousStats: BookingStats = {
      total: previousList.length,
      confirmed: previousList.filter(b => b.status === 'confirmed').length,
      pending: previousList.filter(b => b.status === 'pending').length,
      cancelled: previousList.filter(b => b.status === 'cancelled').length,
      failed: previousList.filter(b => b.status === 'failed').length,
    };

    // Detect significant drops in conversion
    if (previousStats.total > 5) {
      const previousConversion = previousStats.confirmed / previousStats.total;
      const recentConversion = recentStats.total > 0 
        ? recentStats.confirmed / recentStats.total 
        : 0;

      if (previousConversion > 0 && recentConversion < previousConversion * 0.7) {
        anomalies.push({
          type: 'conversion_drop',
          severity: 'warning',
          title: 'Booking Conversion Drop',
          message: `Conversion rate dropped from ${(previousConversion * 100).toFixed(1)}% to ${(recentConversion * 100).toFixed(1)}% (last 24h vs previous)`,
          metadata: { 
            previous_conversion: previousConversion,
            recent_conversion: recentConversion,
            recent_stats: recentStats,
            previous_stats: previousStats,
          },
        });
      }
    }

    // Detect high failure rate
    if (recentStats.failed > 3 && recentStats.failed > recentStats.total * 0.2) {
      anomalies.push({
        type: 'booking_anomaly',
        severity: 'critical',
        title: 'High Booking Failure Rate',
        message: `${recentStats.failed} bookings failed in the last 24h (${((recentStats.failed / recentStats.total) * 100).toFixed(1)}% failure rate)`,
        metadata: { 
          failed_count: recentStats.failed,
          total_count: recentStats.total,
        },
      });
    }

    // Detect unusual pending buildup
    if (recentStats.pending > 10) {
      anomalies.push({
        type: 'booking_anomaly',
        severity: 'warning',
        title: 'Pending Bookings Buildup',
        message: `${recentStats.pending} bookings are still pending - may need attention`,
        metadata: { pending_count: recentStats.pending },
      });
    }
  } catch (error) {
    console.error('[Monitor] Booking anomaly detection error:', error);
  }

  return anomalies;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectLatencySpikes(supabase: any): Promise<AnomalyDetectionResult[]> {
  const anomalies: AnomalyDetectionResult[] = [];
  
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get recent health checks
    const { data: recentChecks } = await supabase
      .from('system_health_checks')
      .select('component_key, latency_ms, checked_at')
      .gte('checked_at', oneHourAgo)
      .not('latency_ms', 'is', null);

    // Get baseline from last 24h
    const { data: baselineChecks } = await supabase
      .from('system_health_checks')
      .select('component_key, latency_ms')
      .gte('checked_at', oneDayAgo)
      .lt('checked_at', oneHourAgo)
      .not('latency_ms', 'is', null);

    const recentList = (recentChecks || []) as Array<{ component_key: string; latency_ms: number; checked_at: string }>;
    const baselineList = (baselineChecks || []) as Array<{ component_key: string; latency_ms: number }>;

    if (!recentList.length || !baselineList.length) return anomalies;

    // Calculate baseline averages by component
    const baselineByComponent: Record<string, number[]> = {};
    for (const check of baselineList) {
      if (!baselineByComponent[check.component_key]) {
        baselineByComponent[check.component_key] = [];
      }
      baselineByComponent[check.component_key].push(check.latency_ms);
    }

    const baselineAvg: Record<string, number> = {};
    for (const [key, latencies] of Object.entries(baselineByComponent)) {
      baselineAvg[key] = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }

    // Check if recent latencies are significantly higher
    const recentByComponent: Record<string, number[]> = {};
    for (const check of recentList) {
      if (!recentByComponent[check.component_key]) {
        recentByComponent[check.component_key] = [];
      }
      recentByComponent[check.component_key].push(check.latency_ms);
    }

    for (const [componentKey, latencies] of Object.entries(recentByComponent)) {
      const avgRecent = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const baseline = baselineAvg[componentKey];

      if (baseline && avgRecent > baseline * 2) {
        anomalies.push({
          type: 'latency_spike',
          severity: avgRecent > baseline * 3 ? 'critical' : 'warning',
          title: 'API Latency Spike',
          message: `${componentKey} latency increased from ${baseline.toFixed(0)}ms to ${avgRecent.toFixed(0)}ms (${((avgRecent / baseline - 1) * 100).toFixed(0)}% increase)`,
          component_key: componentKey,
          metadata: { 
            baseline_ms: baseline, 
            current_ms: avgRecent,
            increase_percent: ((avgRecent / baseline - 1) * 100).toFixed(1),
          },
        });
      }
    }
  } catch (error) {
    console.error('[Monitor] Latency spike detection error:', error);
  }

  return anomalies;
}

async function createAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  anomalies: AnomalyDetectionResult[]
): Promise<number> {
  if (anomalies.length === 0) return 0;

  let created = 0;

  for (const anomaly of anomalies) {
    // Check for existing similar unresolved alert (avoid duplicates)
    const { data: existing } = await supabase
      .from('system_alerts')
      .select('id')
      .eq('alert_type', anomaly.type)
      .eq('is_resolved', false)
      .eq('title', anomaly.title)
      .maybeSingle();

    if (existing) {
      console.log(`[Monitor] Skipping duplicate alert: ${anomaly.title}`);
      continue;
    }

    const { error } = await supabase
      .from('system_alerts')
      .insert({
        alert_type: anomaly.type,
        severity: anomaly.severity,
        title: anomaly.title,
        message: anomaly.message,
        component_key: anomaly.component_key,
        property_id: anomaly.property_id,
        metadata: anomaly.metadata,
      });

    if (error) {
      console.error(`[Monitor] Failed to create alert:`, error);
    } else {
      created++;
      console.log(`[Monitor] Created alert: ${anomaly.title}`);
    }
  }

  return created;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Monitor] Starting anomaly detection scan...');

    // Run all detection functions in parallel
    const [rateDrift, syncFailures, bookingAnomalies, latencySpikes] = await Promise.all([
      detectRateDrift(supabase),
      detectSyncFailures(supabase),
      detectBookingAnomalies(supabase),
      detectLatencySpikes(supabase),
    ]);

    const allAnomalies = [...rateDrift, ...syncFailures, ...bookingAnomalies, ...latencySpikes];

    console.log(`[Monitor] Detected ${allAnomalies.length} anomalies:`, {
      rate_drift: rateDrift.length,
      sync_failures: syncFailures.length,
      booking_anomalies: bookingAnomalies.length,
      latency_spikes: latencySpikes.length,
    });

    // Create alerts for detected anomalies
    const createdCount = await createAlerts(supabase, allAnomalies);

    // Auto-resolve old alerts that are no longer relevant
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('system_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('is_resolved', false)
      .lt('created_at', sevenDaysAgo);

    return new Response(
      JSON.stringify({
        success: true,
        scanned_at: new Date().toISOString(),
        anomalies_detected: allAnomalies.length,
        alerts_created: createdCount,
        breakdown: {
          rate_drift: rateDrift.length,
          sync_failures: syncFailures.length,
          booking_anomalies: bookingAnomalies.length,
          latency_spikes: latencySpikes.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Monitor] Error:', error);
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
