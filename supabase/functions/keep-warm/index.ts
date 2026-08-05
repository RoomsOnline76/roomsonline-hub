import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Lightweight keep-warm pinger.
 *
 * Cold starts hurt most on the handful of functions that sit on the critical
 * path while overall traffic is still low (there isn't enough organic traffic
 * to keep isolates resident). This function pings only those, using an
 * `x-warm: 1` header that each target answers *before* any client creation,
 * auth check or database work — so a ping costs one boot and nothing else.
 *
 * Scheduled via pg_cron (every 5 minutes). Keep the list short: every entry
 * is a paid invocation.
 */
const WARM_TARGETS = [
  'data-access-api',
  'get-feature-flags',
  'booking-orchestrator-api',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const baseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const started = Date.now();
  const results = await Promise.all(
    WARM_TARGETS.map(async (name) => {
      const t0 = Date.now();
      try {
        const res = await fetch(`${baseUrl}/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-warm': '1',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: '{}',
        });
        await res.text();
        return { function: name, status: res.status, ms: Date.now() - t0 };
      } catch (err) {
        return {
          function: name,
          status: 0,
          ms: Date.now() - t0,
          error: String((err as Error)?.message ?? err),
        };
      }
    }),
  );

  const cold = results.filter((r) => r.ms > 400).map((r) => r.function);
  if (cold.length) console.log('keep-warm: slow/cold boots ->', cold.join(', '));

  return new Response(
    JSON.stringify({ success: true, total_ms: Date.now() - started, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
