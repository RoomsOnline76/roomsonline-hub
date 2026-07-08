import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  query: z.string().min(2).max(300),
  locationBias: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radiusM: z.number().min(1).max(50000).optional(),
    })
    .optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { query, locationBias } = parsed.data;

    // Resolve Google Maps API key: api_keys table (project standard) then env fallback.
    let googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data } = await supabase
        .from('api_keys')
        .select('key_name, key_value')
        .in('key_name', ['GOOGLE_MAPS_API_KEY']);
      const fromDb = data?.find((r: any) => r.key_name === 'GOOGLE_MAPS_API_KEY')?.key_value;
      if (fromDb) googleKey = fromDb;
    } catch (_) { /* ignore, fall back to env */ }

    if (!googleKey) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: Record<string, unknown> = { textQuery: query };
    if (locationBias) {
      body.locationBias = {
        circle: {
          center: { latitude: locationBias.lat, longitude: locationBias.lng },
          radius: locationBias.radiusM ?? 20000,
        },
      };
    }

    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Google Places search failed [${resp.status}]: ${errText}`);
      return new Response(
        JSON.stringify({ error: 'Provider request failed', status: resp.status, details: errText }),
        { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await resp.json();
    const results = (data.places ?? []).map((p: any) => ({
      id: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('search-google-place error:', e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
