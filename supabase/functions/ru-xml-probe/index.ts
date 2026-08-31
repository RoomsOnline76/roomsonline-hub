/**
 * TEMPORARY diagnostic surface — posts a hand-written Rentals United XML document on a given
 * sub-account's stored key pair and returns the raw response. It exists purely to bisect XSD
 * validation failures on Push_PutProperty_RQ without burning a full orchestrator run per probe.
 * It never writes to our database. Delete once the schema question is settled.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const ENDPOINT = Deno.env.get('RENTALS_UNITED_ENDPOINT') || 'https://rm.rentalsunited.com/api/Handler.ashx';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json();
    const ownerId = String(body?.owner_id ?? '').trim();
    const xmlTemplate = String(body?.xml ?? '');
    if (!ownerId || !xmlTemplate.includes('{AUTH}')) {
      return json({ error: 'owner_id and xml (containing an {AUTH} placeholder) are required' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: cred, error } = await admin
      .from('ru_api_credentials')
      .select('access_key, secret_enc, key_scope')
      .eq('ru_owner_id', ownerId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!cred?.access_key || !cred?.secret_enc) return json({ error: 'no stored key pair for this owner' }, 409);
    const { data: secret } = await admin.rpc('decrypt_sensitive_text', { encrypted_data: cred.secret_enc });
    if (!secret) return json({ error: 'secret could not be decrypted' }, 500);

    const auth = `<Authentication><UserName>${cred.access_key}</UserName><Password>${secret}</Password></Authentication>`;
    const xml = xmlTemplate.replace('{AUTH}', auth);
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    });
    const text = await resp.text();
    return json({ http_status: resp.status, key_scope: cred.key_scope, response: text });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
