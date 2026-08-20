/**
 * TEMPORARY diagnostic: probe Rentals United for the ObjectType dictionary.
 * Not referenced by the app; safe to delete once the mapping is confirmed.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const key = Deno.env.get('RENTALS_UNITED_API_KEY') ?? '';
  const secret = Deno.env.get('RENTALS_UNITED_API_SECRET') ?? '';
  const endpoint = Deno.env.get('RENTALS_UNITED_ENDPOINT') || 'https://rm.rentalsunited.com/api/Handler.ashx';
  const auth = `<Authentication><AccessKey>${key}</AccessKey><SecretKey>${secret}</SecretKey></Authentication>`;

  const body = await req.json().catch(() => ({}));
  const names: string[] = body.requests ?? [
    'Pull_ListOTAs',
    'Pull_ListPropertyTypes',
    'Pull_ListObjectTypes',
    'Pull_ListOTA',
  ];

  const out: Record<string, string> = {};
  for (const name of names) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<${name}_RQ>\n  ${auth}\n</${name}_RQ>`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: xml,
      });
      const text = await res.text();
      out[name] = text.slice(0, 6000);
    } catch (err) {
      out[name] = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return new Response(JSON.stringify({ success: true, responses: out }, null, 2), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
