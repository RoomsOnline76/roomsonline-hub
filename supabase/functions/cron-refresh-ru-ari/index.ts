import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const [{ data: buildingProps }, { data: unitRows }] = await Promise.all([
      supabase
        .from('properties')
        .select('id, name, rentalsunited_property_id, ru_push_enabled')
        .not('rentalsunited_property_id', 'is', null),
      supabase
        .from('hostfully_room_types')
        .select('property_id, properties!inner(id, name, ru_push_enabled)')
        .not('rentalsunited_property_id', 'is', null),
    ]);

    const propMap = new Map<string, { id: string; name: string; ru_push_enabled?: boolean }>();
    for (const p of buildingProps ?? []) {
      if (p.ru_push_enabled !== false) propMap.set(p.id, p);
    }
    for (const row of (unitRows ?? []) as any[]) {
      const p = row.properties;
      if (p && !propMap.has(p.id) && p.ru_push_enabled !== false) propMap.set(p.id, p);
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

    const results: { property_id: string; name: string; success: boolean; error?: string }[] = [];

    for (const prop of properties) {
      const startedAt = Date.now();
      let success = false;
      let errMsg: string | null = null;
      let httpStatus: number | null = null;

      try {
        const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: prop.id },
        });
        if (error) {
          errMsg = error.message;
        } else if (!data?.success) {
          errMsg = data?.error?.message || 'Unknown error';
        } else {
          success = true;
        }
        httpStatus = success ? 200 : 502;
      } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
      }

      const elapsed = Date.now() - startedAt;
      results.push({ property_id: prop.id, name: prop.name, success, error: errMsg || undefined });

      // Log to ru_sync_runs (non-blocking)
      await supabase.from('ru_sync_runs').insert({
        batch_id: batchId,
        action: 'refresh_ari',
        property_id: prop.id,
        success,
        http_status: httpStatus,
        error_message: errMsg,
        elapsed_ms: elapsed,
        details: { scope: 'daily_ari' },
      }).then(() => {}, (e) => console.warn('[cron-refresh-ru-ari] log insert failed', e));

      // Small delay between pushes to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batchId,
        message: `Refreshed ARI for ${successCount}/${properties.length} properties`,
        pushed: successCount,
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
