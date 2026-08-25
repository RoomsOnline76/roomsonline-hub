import { createClient } from 'npm:@supabase/supabase-js@2';
import { readInvokeError } from '../_shared/functionInvokeError.ts';


/**
 * Daily cron: Refresh Availability + Rates + Inventory (ARI) for every
 * Rentals United connected property.
 *
 * RU White-Label requirement: Push_PutAvbUnits_RQ + Push_PutPrices_RQ MUST
 * be called at least every 24 hours, in addition to on-change.
 *
 * Delegates the actual payload building to `push-property-to-ru` (which is
 * already the single owner of the RU push contract) and records the outcome
 * to `ru_sync_runs` for observability.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const batchId = crypto.randomUUID();

  // Optional manual scoping: { property_ids: [uuid, ...] } limits the run to those properties.
  let scopeIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.property_ids)) scopeIds = body.property_ids.filter((v: unknown) => typeof v === 'string');
  } catch (_e) {
    // no body — full run
  }

  try {
    // Collect RU-connected properties (parent-level + fan-out via room types)
    // Collect RU-connected properties (parent-level + fan-out via ACTIVE room types only).
    // Archived/retired units keep their old channel IDs for audit, but re-pushing them
    // produces permanent "property does not exist" failures — they must never be queued.
    const [{ data: buildingProps }, { data: unitRows }] = await Promise.all([
      supabase
        .from('properties')
        .select('id, name, rentalsunited_property_id, ru_push_enabled')
        .eq('is_active', true)
        .not('rentalsunited_property_id', 'is', null),
      supabase
        .from('hostfully_room_types')
        .select('property_id, is_active, properties!inner(id, name, is_active, ru_push_enabled)')
        .eq('is_active', true)
        .not('rentalsunited_property_id', 'is', null),
    ]);


    const propMap = new Map<string, { id: string; name: string; ru_push_enabled?: boolean }>();
    for (const p of buildingProps ?? []) {
      if (p.ru_push_enabled === true) propMap.set(p.id, p);
    }
    for (const row of (unitRows ?? []) as any[]) {
      const p = row.properties;
      if (p && p.is_active !== false && !propMap.has(p.id) && p.ru_push_enabled === true) propMap.set(p.id, p);
    }

    let properties = Array.from(propMap.values());
    if (scopeIds.length) properties = properties.filter((p) => scopeIds.includes(p.id));

    if (properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, batch_id: batchId, message: 'No RU-connected properties to refresh', pushed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[cron-refresh-ru-ari] Refreshing ARI for ${properties.length} properties (batch ${batchId})`);

    const results: { property_id: string; name: string; success: boolean; skipped?: boolean; error?: string }[] = [];

    // Codes that mean "nothing to push", not "push failed" — they must not pollute the failure rate.
    const SKIP_CODES = new Set(['RU_NOT_LISTED', 'RU_NOT_CONFIGURED', 'RU_LISTING_STALE', 'CHANNEL_MANAGER_DISABLED']);

    for (const prop of properties) {
      const startedAt = Date.now();
      let success = false;
      let skipped = false;
      let errMsg: string | null = null;
      let httpStatus: number | null = null;
      let errCode: string | null = null;

      try {
        // ARI-only mode: availability + pricing for inventory already listed at RU. Static
        // content is not re-pushed, so a content shortfall can never stall the ARI refresh.
        const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: prop.id, action: 'refresh_ari', trigger: 'cron_daily_ari', verify_readback: false, verify_discount_readback: false },
        });

        if (error) {
          // invoke() hides the JSON body behind "non-2xx status code" — read it so the
          // health report shows the real reason and status instead of an UNKNOWN bucket.
          const detail = await readInvokeError(error, 'ARI refresh failed');
          errMsg = detail.message;
          errCode = detail.errorCode ?? (detail.httpStatus ? `HTTP_${detail.httpStatus}` : null);
          httpStatus = detail.httpStatus;
          if (errCode && SKIP_CODES.has(errCode)) skipped = true;
        } else if (!data?.success) {
          errCode = data?.error?.code ?? null;
          errMsg = data?.error?.message || 'Unknown error';
          if (errCode && SKIP_CODES.has(errCode)) skipped = true;
        } else {
          success = true;
        }
        if (httpStatus === null) httpStatus = success ? 200 : skipped ? 200 : 502;

      } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
      }

      const elapsed = Date.now() - startedAt;
      results.push({ property_id: prop.id, name: prop.name, success, skipped, error: errMsg || undefined });


      // A single flaky upstream call is very different from a pipeline that has been broken for
      // several cycles — count how many consecutive cron runs this property has now failed.
      let consecutiveFailures = 0;
      if (!success && !skipped) {
        const { data: history } = await supabase
          .from('ru_sync_runs')
          .select('success, created_at, details')
          .eq('action', 'refresh_ari')
          .eq('property_id', prop.id)
          .order('created_at', { ascending: false })
          .limit(6);
        consecutiveFailures = 1;
        for (const row of (history ?? []) as { success: boolean; details?: Record<string, unknown> | null }[]) {
          if ((row.details as any)?.scope !== 'daily_ari') continue;
          if (row.success === false) consecutiveFailures += 1;
          else break;
        }
      }

      // Log to ru_sync_runs (non-blocking). Skips are recorded but not counted as failures.
      await supabase.from('ru_sync_runs').insert({
        batch_id: batchId,
        action: 'refresh_ari',
        property_id: prop.id,
        success: success || skipped,
        http_status: httpStatus,
        error_code: errCode,
        error_message: errMsg,
        elapsed_ms: elapsed,
        details: {
          scope: 'daily_ari',
          skipped,
          consecutive_failures: consecutiveFailures,
          escalate: consecutiveFailures >= 3,
        },
      }).then(() => {}, (e) => console.warn('[cron-refresh-ru-ari] log insert failed', e));

      // Small delay between pushes to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;
    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batchId,
        message: `Refreshed ARI for ${successCount}/${properties.length} properties${skippedCount ? ` (${skippedCount} skipped — nothing listed)` : ''}`,
        pushed: successCount,
        skipped: skippedCount,
        total: properties.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cron-refresh-ru-ari] Error:', error);
    return new Response(
      JSON.stringify({ success: false, batch_id: batchId, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
