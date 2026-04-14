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

    // ── Step 1: Get all properties with an RU property ID ──────
    const { data: properties, error } = await supabase
      .from('properties')
      .select('id, name, rentalsunited_property_id')
      .not('rentalsunited_property_id', 'is', null);

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

    console.log(`[cron-push-all] Pushing ${properties.length} properties to RU...`);

    const results: { property_id: string; name: string; success: boolean; error?: string }[] = [];

    // Push sequentially to avoid rate limiting
    for (const prop of properties) {
      try {
        const { data, error: pushErr } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: prop.id },
        });

        if (pushErr) {
          results.push({ property_id: prop.id, name: prop.name, success: false, error: pushErr.message });
          console.warn(`[cron-push-all] Failed: ${prop.name} — ${pushErr.message}`);
        } else if (!data?.success) {
          results.push({ property_id: prop.id, name: prop.name, success: false, error: data?.error?.message || 'Unknown' });
          console.warn(`[cron-push-all] Failed: ${prop.name} — ${data?.error?.message}`);
        } else {
          results.push({ property_id: prop.id, name: prop.name, success: true });
          console.log(`[cron-push-all] OK: ${prop.name}`);
        }
      } catch (err) {
        results.push({ property_id: prop.id, name: prop.name, success: false, error: err instanceof Error ? err.message : 'Unknown' });
      }

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
