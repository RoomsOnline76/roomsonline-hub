// Static content delta entry point.
//
// One fire-and-forget endpoint every ROLOS save surface can call after persisting static
// property content. All RU logic (connectivity, pause state, fingerprint, debounce, push)
// lives in the shared helper so no client ever owns part of the RU contract.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { queueRuStaticDelta } from '../_shared/ruStaticDelta.ts';

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
    const outcome = await queueRuStaticDelta(supabase, propertyId, trigger, {
      force: body?.force === true,
    });

    return new Response(JSON.stringify({ success: true, ...outcome }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ru-static-delta] Failed:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
