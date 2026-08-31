// Rates & availability (ARI) delta entry point.
//
// Mirror of `ru-static-delta`, but for what a night costs and whether it is sellable.
// Every ROLOS surface that changes seasons, rate plans, rate prices, stop-sell or blocks
// calls this after a successful write. All RU logic (connectivity, pause state, debounce,
// push) lives in the shared helper so no client owns part of the RU contract.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { queueRuAriDelta } from '../_shared/ruAriDelta.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    // Authenticated callers only — this triggers writes to a third-party channel.
    const authHeader = req.headers.get('Authorization') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.property_id === 'string' ? body.property_id : null;
    if (!propertyId) {
      return new Response(JSON.stringify({ success: false, error: 'property_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const trigger = typeof body?.trigger === 'string' && body.trigger.trim().length > 0
      ? body.trigger.trim().slice(0, 80)
      : 'manual';

    const supabase = createClient(supabaseUrl, serviceKey);
    const isoDay = (v: unknown): string | null =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    const work = queueRuAriDelta(supabase, propertyId, trigger, {
      force: body?.force === true,
      forceAvailability: body?.force_availability === true,
      dateFrom: isoDay(body?.date_from),
      dateTo: isoDay(body?.date_to),
      onlyUnitIds: Array.isArray(body?.only_unit_ids)
        ? (body.only_unit_ids as unknown[]).map((u) => String(u)).filter((u) => u.length > 0)
        : null,
      verifyAvailabilityReadback: body?.verify_availability_readback === true,
    });


    // Save-path callers fire and forget: keep the work alive after the response so closing the
    // editor cannot strand an in-flight rates push. `wait: true` (manual sync, diagnostics)
    // still gets the full outcome inline.
    if (body?.wait === true) {
      const outcome = await work;
      return new Response(JSON.stringify({ success: true, ...outcome }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(work.catch((err) => console.error('[ru-ari-delta] background failed:', err)));
    } else {
      void work.catch((err) => console.error('[ru-ari-delta] background failed:', err));
    }

    return new Response(JSON.stringify({ success: true, accepted: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ru-ari-delta] Failed:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
