import { createClient } from 'npm:@supabase/supabase-js@2';
import { readInvokeError } from '../_shared/functionInvokeError.ts';
import { planStaticPushScope } from '../_shared/ruStaticDelta.ts';

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

  // Optional manual scoping: { property_ids: [uuid, ...] } limits the run to those properties.
  let scopeIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.property_ids)) scopeIds = body.property_ids.filter((v: unknown) => typeof v === 'string');
  } catch (_e) {
    // no body — full run
  }

  try {
    // ── Step 0: Refresh RLNM subscription ──────────────────────
    // The handler URL is registered PER ACCOUNT, so it must fan out over master +
    // every sub-user with verified API keys. Delegate to the dedicated RLNM cron
    // (which resolves scoped credentials and paces RU's per-method rate limit)
    // instead of calling rentalsunited-api on master credentials here.
    const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
    let rlnmStatus = 'skipped';
    try {
      console.log(`[cron-push-all] Refreshing RLNM handler per account: ${handlerUrl}`);
      const { data: rlnmResult, error: rlnmErr } = await supabase.functions.invoke('cron-ru-rlnm-refresh', {
        body: {},
      });
      if (rlnmErr || !rlnmResult?.success) {
        const failed = (rlnmResult?.results ?? [])
          .filter((r: { success: boolean }) => !r.success)
          .map((r: { account: string; error: string | null }) => `${r.account}: ${r.error}`)
          .join('; ');
        rlnmStatus = `failed: ${rlnmErr?.message || failed || 'Unknown'}`;
        console.warn(`[cron-push-all] RLNM subscription failed:`, rlnmStatus);
      } else {
        rlnmStatus = 'ok';
        console.log(`[cron-push-all] RLNM subscription refreshed for all RU accounts`);
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
        .eq('is_active', true)
        .not('rentalsunited_property_id', 'is', null),
      // ACTIVE units only — archived duplicates keep stale channel IDs that can never be pushed.
      supabase
        .from('hostfully_room_types')
        .select('property_id, is_active, properties!inner(id, name, is_active, rentalsunited_property_id, ru_push_enabled)')
        .eq('is_active', true)
        .not('rentalsunited_property_id', 'is', null),
    ]);


    const error = buildingErr || unitErr;
    const propMap = new Map<string, { id: string; name: string; rentalsunited_property_id: string | null; ru_push_enabled?: boolean }>();
    for (const p of buildingProps ?? []) {
      if (p.ru_push_enabled === true) propMap.set(p.id, p);
    }
    for (const row of (unitRows ?? []) as any[]) {
      const p = row.properties;
      if (p && p.is_active !== false && p.ru_push_enabled === true && !propMap.has(p.id)) propMap.set(p.id, p);
    }

    let properties = Array.from(propMap.values());
    if (scopeIds.length) properties = properties.filter((p) => scopeIds.includes(p.id));

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

    const results: {
      property_id: string;
      name: string;
      success: boolean;
      status: 'complete' | 'resumable' | 'failed' | 'skipped';
      reason?: string;
      error_code?: string;
      error?: string;
      chunks?: number;
      resume_pending?: number;
    }[] = [];

    // Overall time budget for the run. Multi-unit properties are pushed a chunk at a
    // time, so the sequence has to be resumed until it completes; anything still
    // outstanding when the budget runs out is reported as pending, never as a failure.
    const RUN_STARTED = Date.now();
    const RUN_BUDGET_MS = 12 * 60 * 1000;
    const CHUNK_PAUSE_MS = 1500;
    const MAX_CHUNKS_PER_PROPERTY = 12;

    // Push sequentially to avoid rate limiting
    for (const prop of properties) {
      // Do not start another property when the invocation is already near its budget. The
      // completed property rows remain durable and the next scheduled run can resume safely.
      if (Date.now() - RUN_STARTED > RUN_BUDGET_MS) {
        console.log(`[cron-push-all] Run budget reached before ${prop.name} — leaving it for the next run`);
        break;
      }
      /**
       * Static scope only. This job used to invoke the full push (static + a full-year ARI +
       * discounts) on top of the daily ARI cron, so every week each property paid for an ARI
       * write it had already made. Unchanged content is skipped outright; changed content goes
       * as a scoped `static_only` push. ARI belongs to `cron-refresh-ru-ari` and the event deltas.
       */
      let staticScope: Awaited<ReturnType<typeof planStaticPushScope>> | null = null;
      try {
        staticScope = await planStaticPushScope(supabase, prop.id);
      } catch (planErr) {
        console.warn(`[cron-push-all] Scope plan failed for ${prop.name}:`, planErr);
      }
      if (staticScope?.unchanged) {
        console.log(`[cron-push-all] ${prop.name}: static content unchanged — skipping`);
        results.push({ property_id: prop.id, name: prop.name, success: true, status: 'skipped', reason: 'unchanged' });
        continue;
      }

      const startedAt = Date.now();
      let success = false;
      let status: 'complete' | 'resumable' | 'failed' = 'failed';
      let errCode: string | null = null;
      let httpStatus: number | null = null;
      let errMsg: string | null = null;
      let chunks = 0;
      let remainingUnitIds: string[] = [];
      let sequenceBatchId: string | undefined;

      try {
        // Resume loop: keep pushing the next slice while the channel keeps accepting it.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          chunks += 1;
          const { data, error: pushErr } = await supabase.functions.invoke('push-property-to-ru', {
            body: {
              property_id: prop.id,
              action: 'static_only',
              ...(remainingUnitIds.length > 0
                ? { only_unit_ids: remainingUnitIds }
                : staticScope?.scope_unit_ids && staticScope.scope_unit_ids.length > 0
                  ? { only_unit_ids: staticScope.scope_unit_ids }
                  : {}),
              ...(staticScope?.changed_fields?.length ? { changed_fields: staticScope.changed_fields } : {}),
              ...(sequenceBatchId ? { batch_id: sequenceBatchId } : {}),
            },
          });

          if (pushErr) {
            const failure = await readInvokeError(pushErr, 'Channel push could not be invoked');
            httpStatus = failure.httpStatus;
            errCode = failure.errorCode ?? (httpStatus ? `HTTP_${httpStatus}` : 'RU_PUSH_INVOKE_FAILED');
            errMsg = failure.message;
            console.warn(`[cron-push-all] Failed: ${prop.name} — ${errMsg}`);
            break;
          }

          const pushStatus = data?.status ?? (data?.success ? 'complete' : 'failed');
          if (typeof data?.batch_id === 'string' && data.batch_id) sequenceBatchId = data.batch_id;
          const nextRemaining: string[] = Array.isArray(data?.remaining_unit_ids)
            ? data.remaining_unit_ids.filter((v: unknown) => typeof v === 'string')
            : [];

          if (pushStatus === 'complete') {
            success = true;
            status = 'complete';
            remainingUnitIds = [];
            console.log(`[cron-push-all] OK: ${prop.name} (${chunks} chunk(s))`);
            break;
          }

          if (pushStatus === 'resumable' && nextRemaining.length > 0) {
            // Healthy partial chunk — the units that went out are live at the channel.
            success = true;
            status = 'resumable';
            remainingUnitIds = nextRemaining;
            console.log(
              `[cron-push-all] ${prop.name}: chunk ${chunks} done, ${nextRemaining.length} unit(s) still queued`,
            );

            if (chunks >= MAX_CHUNKS_PER_PROPERTY) {
              console.log(`[cron-push-all] ${prop.name}: chunk cap reached — resuming next run`);
              break;
            }
            if (Date.now() - RUN_STARTED > RUN_BUDGET_MS) {
              console.log(`[cron-push-all] ${prop.name}: run budget reached — resuming next run`);
              break;
            }
            await new Promise((r) => setTimeout(r, CHUNK_PAUSE_MS));
            continue;
          }

          // Real rejection / interruption — always carries a reason now.
          status = 'failed';
          errCode = data?.error?.code || 'RU_PUSH_FAILED';
          errMsg = data?.error?.message || `Channel push failed (${errCode})`;
          console.warn(`[cron-push-all] Failed: ${prop.name} — ${errMsg}`);
          break;
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Channel push threw an unexpected error';
        errCode = 'RU_PUSH_EXCEPTION';
        status = 'failed';
        success = false;
      }

      results.push({
        property_id: prop.id,
        name: prop.name,
        success,
        status,
        error_code: errCode || undefined,
        error: errMsg || undefined,
        chunks,
        ...(remainingUnitIds.length > 0 ? { resume_pending: remainingUnitIds.length } : {}),
      });

      // Observability log (non-blocking)
      await supabase.from('ru_sync_runs').insert({
        batch_id: sequenceBatchId ?? batchId,
        action: 'weekly_content_refresh',
        property_id: prop.id,
        success,
        error_code: errCode,
        error_message: errMsg,
        http_status: httpStatus,
        elapsed_ms: Date.now() - startedAt,
        details: {
          rlnm: rlnmStatus,
          manual_scope: scopeIds.length ? scopeIds : undefined,
          chunks,
          status,
          run_batch_id: batchId,
          sequence_batch_id: sequenceBatchId,
          resume_pending: remainingUnitIds.length,
          remaining_unit_ids: remainingUnitIds.length ? remainingUnitIds : undefined,
        },
      }).then(() => {}, (e) => console.warn('[cron-push-all] log insert failed', e));

      // Small delay between properties
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
