/**
 * cron-prune-ru-api-log
 *
 * Deletes expired rows from the durable channel-manager exchange log.
 *
 * Retention lives on the table (`ru_api_log.expires_at`, default now() + 90 days) so the window can
 * be raised for a support case without redeploying this function. Rentals United White Label
 * certification requires a minimum of 30 days.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const cutoff = new Date().toISOString();
    const { data, error } = await admin
      .from('ru_api_log')
      .delete()
      .lt('expires_at', cutoff)
      .select('id');

    if (error) throw error;

    const deleted = data?.length ?? 0;
    console.log(`[cron-prune-ru-api-log] Deleted ${deleted} expired exchange log rows`);

    return new Response(JSON.stringify({ success: true, deleted, cutoff }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron-prune-ru-api-log] Failed:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
