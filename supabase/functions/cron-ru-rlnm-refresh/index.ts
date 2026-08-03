import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveRuOwnerScopes } from '../_shared/ruOwnerScopes.ts';

/**
 * Daily cron: re-subscribe the Rentals United RLNM handler URL.
 * RU requires LNM_PutHandlerUrl_RQ to be refreshed at least every 24 hours,
 * otherwise push notifications stop being delivered.
 *
 * Credentials: the handler URL is registered PER ACCOUNT. Registering it only on
 * the master account means white-label sub-users never push their reservations
 * to us, so this fans out over master + every sub-user with API keys.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** RU rate limit: one call per method per sliding minute (+1s safety). */
const METHOD_WINDOW_MS = 61_000;
const RUN_BUDGET_MS = 6 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
  const startedAt = Date.now();
  const deadline = startedAt + RUN_BUDGET_MS;
  const batchId = crypto.randomUUID();

  const results: { account: string; success: boolean; error: string | null }[] = [];
  const deferred: string[] = [];

  const scopes = await resolveRuOwnerScopes(supabase, 'PutHandlerUrl');

  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    if (i > 0) {
      if (Date.now() + METHOD_WINDOW_MS > deadline) {
        deferred.push(...scopes.slice(i).map((s) => s.label));
        break;
      }
      await new Promise((r) => setTimeout(r, METHOD_WINDOW_MS));
    }

    let success = false;
    let errMsg: string | null = null;
    const stepStart = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'subscribe_notifications', handler_url: handlerUrl, ...scope.payload },
      });
      if (error || !data?.success) {
        errMsg = error?.message || data?.error?.message || 'Unknown error';
      } else if (scope.ownerId && data.auth_mode === 'master') {
        // Registering the handler on master credentials would leave this sub-user unmonitored.
        errMsg = `RU answered on MASTER credentials — add this sub-user's RU AccessKey/SecretKey before its notifications can be registered.`;
      } else {
        success = true;
      }
    } catch (err) {
      errMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    results.push({ account: scope.label, success, error: errMsg });

    await supabase.from('ru_sync_runs').insert({
      batch_id: batchId,
      action: 'PutHandlerUrl',
      success,
      error_message: errMsg,
      elapsed_ms: Date.now() - stepStart,
      details: {
        handler_url: handlerUrl,
        scope: 'daily_rlnm',
        ru_owner_id: scope.ownerId,
        account: scope.label,
      },
    }).then(() => {}, (e) => console.warn('[cron-ru-rlnm-refresh] log insert failed', e));

    console.log(`[cron-ru-rlnm-refresh] ${scope.label}: ${success ? 'OK' : `FAILED: ${errMsg}`}`);
  }

  const allOk = results.length > 0 && results.every((r) => r.success);

  return new Response(
    JSON.stringify({ success: allOk, handler_url: handlerUrl, results, deferred }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
