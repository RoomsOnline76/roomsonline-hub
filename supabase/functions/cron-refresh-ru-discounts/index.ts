import { createClient } from 'npm:@supabase/supabase-js@2';
import { readInvokeError } from '../_shared/functionInvokeError.ts';

/**
 * Daily cron: re-push the Rentals United discount ladder for every connected property.
 *
 * RU White-Label requirement: Push_PutLongStayDiscounts_RQ + Push_PutLastMinuteDiscounts_RQ
 * must be pushed on change AND at least every 24 hours. The event-driven half is triggered
 * when a discount ladder / special is saved; this job is the cadence half.
 *
 * The payload building stays in `push-property-to-ru` (action: 'discounts_only'), the single
 * owner of the RU push contract. Outcomes land in `ru_sync_runs` as `push_discounts`.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Codes that mean "nothing to push", not "push failed". */
const SKIP_CODES = new Set(['RU_NOT_LISTED', 'RU_NOT_CONFIGURED', 'RU_LISTING_STALE', 'CHANNEL_MANAGER_DISABLED']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const batchId = crypto.randomUUID();

  let scopeIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.property_ids)) scopeIds = body.property_ids.filter((v: unknown) => typeof v === 'string');
  } catch (_e) {
    // no body — full run
  }

  try {
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

    const propMap = new Map<string, { id: string; name: string }>();
    for (const p of (buildingProps ?? []) as any[]) {
      if (p.ru_push_enabled !== false) propMap.set(p.id, p);
    }
    for (const row of (unitRows ?? []) as any[]) {
      const p = row.properties;
      if (p && p.is_active !== false && p.ru_push_enabled !== false && !propMap.has(p.id)) propMap.set(p.id, p);
    }

    let properties = Array.from(propMap.values());
    if (scopeIds.length) properties = properties.filter((p) => scopeIds.includes(p.id));

    if (properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, batch_id: batchId, message: 'No Channel Manager properties to refresh', pushed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[cron-refresh-ru-discounts] Refreshing discounts for ${properties.length} properties (batch ${batchId})`);

    const results: { property_id: string; name: string; success: boolean; skipped?: boolean; error?: string }[] = [];

    for (const prop of properties) {
      const startedAt = Date.now();
      let success = false;
      let skipped = false;
      let errMsg: string | null = null;
      let errCode: string | null = null;
      let httpStatus: number | null = null;

      try {
        const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: prop.id, action: 'discounts_only', trigger: 'cron_daily_discounts' },
        });
        if (error) {
          const detail = await readInvokeError(error, 'Discount refresh failed');
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
        if (httpStatus === null) httpStatus = success || skipped ? 200 : 502;
      } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
      }

      results.push({ property_id: prop.id, name: prop.name, success, skipped, error: errMsg || undefined });

      await supabase.from('ru_sync_runs').insert({
        batch_id: batchId,
        action: 'refresh_discounts',
        property_id: prop.id,
        success: success || skipped,
        http_status: httpStatus,
        error_code: errCode,
        error_message: errMsg,
        elapsed_ms: Date.now() - startedAt,
        details: { scope: 'daily_discounts', skipped },
      }).then(() => {}, (e) => console.warn('[cron-refresh-ru-discounts] log insert failed', e));

      await new Promise((r) => setTimeout(r, 800));
    }

    const successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    return new Response(
      JSON.stringify({
        success: true,
        batch_id: batchId,
        message: `Refreshed discounts for ${successCount}/${properties.length} properties${skippedCount ? ` (${skippedCount} skipped — nothing to push)` : ''}`,
        pushed: successCount,
        skipped: skippedCount,
        total: properties.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[cron-refresh-ru-discounts] Error:', error);
    return new Response(
      JSON.stringify({ success: false, batch_id: batchId, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
