import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Daily cron: re-subscribe the Rentals United RLNM handler URL.
 * RU requires LNM_PutHandlerUrl_RQ to be refreshed at least every 24 hours,
 * otherwise push notifications stop being delivered.
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
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
  const startedAt = Date.now();

  let success = false;
  let errMsg: string | null = null;

  try {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: { action: 'subscribe_notifications', handler_url: handlerUrl },
    });
    if (error || !data?.success) {
      errMsg = error?.message || data?.error?.message || 'Unknown error';
    } else {
      success = true;
    }
  } catch (err) {
    errMsg = err instanceof Error ? err.message : 'Unknown error';
  }

  await supabase.from('ru_sync_runs').insert({
    batch_id: crypto.randomUUID(),
    action: 'PutHandlerUrl',
    success,
    error_message: errMsg,
    elapsed_ms: Date.now() - startedAt,
    details: { handler_url: handlerUrl, scope: 'daily_rlnm' },
  }).then(() => {}, (e) => console.warn('[cron-ru-rlnm-refresh] log insert failed', e));

  console.log(`[cron-ru-rlnm-refresh] ${success ? 'OK' : `FAILED: ${errMsg}`}`);

  return new Response(
    JSON.stringify({ success, handler_url: handlerUrl, error: errMsg }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
