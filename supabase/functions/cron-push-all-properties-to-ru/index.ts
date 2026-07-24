import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Weekly cron job: Push all RU-connected properties to Rentals United.
 * Also refreshes RLNM subscription (mandatory every 24 hours).
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

  try {
    // ── Step 0: Refresh RLNM subscription ──────────────────────
    const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
    let rlnmStatus = 'skipped';
    try {
      console.log(`[cron-push-all] Subscribing RLNM handler: ${handlerUrl}`);
      const { data: rlnmResult, error: rlnmErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'subscribe_notifications', handler_url: handlerUrl },
      });
      if (rlnmErr || !rlnmResult?.success) {
        rlnmStatus = `failed: ${rlnmErr?.message || rlnmResult?.error?.message || 'Unknown'}`;
        console.warn(`[cron-push-all] RLNM subscription failed:`, rlnmStatus);
      } else {
        rlnmStatus = 'ok';
        console.log(`[cron-push-all] RLNM subscription refreshed successfully`);
      }
    } catch (err) {
      rlnmStatus = `error: ${err instanceof Error ? err.message : 'Unknown'}`;
      console.error(`[cron-push-all] RLNM subscription error:`, err);
    }

    // ── Step 1: Get all properties with an RU connection (respect ru_push_enabled flag) ──
    // A property qualifies if EITHER:
    //   (a) properties.rentalsunited_property_id is set (single-unit / building-level push), OR
    //   (b) any of its hostfully_room_types rows have rentalsunited_property_id set (multi-unit fan-out)
    // AND properties.ru_push_enabled is not explicitly false.
    const [{ data: buildingProps, error: buildingErr }, { data: unitRows, error: unitErr }] = await Promise.all([
      supabase
        .from('properties')
        .select('id, name, rentalsunited_property_id, ru_push_enabled')
        .not('rentalsunited_property_id', 'is', null),
      supabase
        .from('hostfully_room_types')
        .select('property_id, properties!inner(id, name, rentalsunited_property_id, ru_push_enabled)')
        .not('rentalsunited_property_id', 'is', null),
    ]);

    const error = buildingErr || unitErr;
    const propMap = new Map<string, { id: string; name: string; rentalsunited_property_id: string | null; ru_push_enabled?: boolean }>();
    for (const p of buildingProps ?? []) {
      if (p.ru_push_enabled !== false) propMap.set(p.id, p);
    }
    for (const row of (unitRows ?? []) as any[]) {
      const p = row.properties;
      if (p && p.ru_push_enabled !== false && !propMap.has(p.id)) propMap.set(p.id, p);
    }
    const properties = Array.from(propMap.values());

    if (error) {
      console.error('[cron-push-all] Query error:', error.message);
      return new Response(
        JSON.stringify({ success: false, error: error.message, rlnm: rlnmStatus }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No RU-connected properties found', pushed: 0, rlnm: rlnmStatus }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batchId = crypto.randomUUID();
    console.log(`[cron-push-all] Pushing ${properties.length} properties to RU... (batch ${batchId})`);

    const results: { property_id: string; name: string; success: boolean; error?: string }[] = [];

    // Push sequentially to avoid rate limiting
    for (const prop of properties) {
      const startedAt = Date.now();
      let success = false;
      let errMsg: string | null = null;
      try {
        const { data, error: pushErr } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: prop.id },
        });

        if (pushErr) {
          errMsg = pushErr.message;
          console.warn(`[cron-push-all] Failed: ${prop.name} — ${errMsg}`);
        } else if (!data?.success) {
          errMsg = data?.error?.message || 'Unknown';
          console.warn(`[cron-push-all] Failed: ${prop.name} — ${errMsg}`);
        } else {
          success = true;
          console.log(`[cron-push-all] OK: ${prop.name}`);
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown';
      }

      results.push({ property_id: prop.id, name: prop.name, success, error: errMsg || undefined });

      // Observability log (non-blocking)
      await supabase.from('ru_sync_runs').insert({
        batch_id: batchId,
        action: 'weekly_content_refresh',
        property_id: prop.id,
        success,
        error_message: errMsg,
        elapsed_ms: Date.now() - startedAt,
        details: { rlnm: rlnmStatus },
      }).then(() => {}, (e) => console.warn('[cron-push-all] log insert failed', e));

      // Small delay between pushes
      await new Promise(r => setTimeout(r, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    return new Response(
      JSON.stringify({
        success: true,
        message: `Pushed ${successCount}/${properties.length} properties to RU`,
        pushed: successCount,
        total: properties.length,
        rlnm: rlnmStatus,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cron-push-all] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
