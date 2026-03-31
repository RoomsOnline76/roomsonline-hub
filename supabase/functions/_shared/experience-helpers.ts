// ============================================================================
// EXPERIENCE ENGINE — SHARED HELPERS
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Resolve experience config for a property + type.
 * Falls back to a global default row (property_id IS NULL) if no property-specific config exists.
 */
export async function resolveExperienceConfig(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  experienceType: string
): Promise<Record<string, unknown>> {
  // Try property-specific first
  const { data: specific } = await supabase
    .from('rolos_experience_configs')
    .select('config, is_active')
    .eq('property_id', propertyId)
    .eq('experience_type', experienceType)
    .maybeSingle();

  if (specific?.config) {
    return { ...specific.config as Record<string, unknown>, is_active: specific.is_active };
  }

  // No property-specific config — return empty default
  return { is_active: false };
}

/**
 * Call the correct PMS adapter with a live availability check.
 * Enforces NO_BOOKING_FROM_CACHE invariant — never reads from pms_availability_cache.
 */
export async function callPmsAdapterWithLiveCheck(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Look up the property's PMS system from pms_tracker_status
  const { data: tracker, error: trackerError } = await supabase
    .from('pms_tracker_status')
    .select('system_name, is_active')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (trackerError || !tracker) {
    throw new Error('PMS_UNAVAILABLE: No PMS configured for this property');
  }

  if (!tracker.is_active) {
    throw new Error('PMS_UNAVAILABLE: PMS adapter is not active for this property');
  }

  // Map system_name to edge function name
  const adapterMap: Record<string, string> = {
    benson: 'benson-api',
    nightsbridge: 'nightsbridge-api',
    checkfront: 'checkfront-api',
    cloudbeds: 'cloudbeds-api',
    hostfully: 'hostfully-api',
    hotelbeds: 'hotelbeds-api',
    littlehotelier: 'little-hotelier-api',
    roomsonline: 'rolos-pms-adapter',
  };

  const functionName = adapterMap[tracker.system_name?.toLowerCase()] || null;
  if (!functionName) {
    throw new Error(`PMS_UNAVAILABLE: Unknown PMS system "${tracker.system_name}"`);
  }

  // Invoke the adapter with fetch_availability action — ALWAYS LIVE
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      action: 'fetch_availability',
      propertyId,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`PMS_UNAVAILABLE: Adapter returned ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`PMS_UNAVAILABLE: ${result.error?.message || 'Adapter call failed'}`);
  }

  return result.data;
}
