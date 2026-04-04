import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get API keys from database AND env secrets
    const { data: apiKeys } = await supabase
      .from('api_keys')
      .select('key_name, key_value')
      .in('key_name', ['GOOGLE_MAPS_API_KEY', 'TRIPADVISOR_API_KEY']);

    const keyMap: Record<string, string> = {};
    apiKeys?.forEach((k: any) => { if (k.key_value) keyMap[k.key_name] = k.key_value; });

    const googleKey = keyMap['GOOGLE_MAPS_API_KEY'] || Deno.env.get('GOOGLE_MAPS_API_KEY') || '';
    const tripadvisorKey = keyMap['TRIPADVISOR_API_KEY'] || Deno.env.get('TRIPADVISOR_API_KEY') || '';
    const xaiKey = Deno.env.get('XAI_API_KEY') || '';

    console.log('API keys available:', { google: !!googleKey, tripadvisor: !!tripadvisorKey, xai: !!xaiKey });

    let body: { property_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body for cron */ }

    let query = supabase
      .from('properties')
      .select('id, name, city, country, address, amenities, description')
      .eq('is_active', true);

    if (body.property_id) {
      query = query.eq('id', body.property_id);
    }

    const { data: properties, error: propError } = await query.limit(100);
    if (propError) throw propError;

    const results: any[] = [];

    for (const property of (properties || [])) {
      const amenities = (property.amenities || {}) as any;
      const externalIds = amenities.external_ids || {};
      
      const reviewPlatformsRaw = amenities.review_platforms;
      let googlePlaceId = externalIds.google_place_id || '';
      let tripadvisorId = externalIds.tripadvisor_id || amenities.tripadvisor_id || '';

      if (Array.isArray(reviewPlatformsRaw)) {
        const googleEntry = reviewPlatformsRaw.find((p: any) => p.type === 'google' && p.enabled);
        const taEntry = reviewPlatformsRaw.find((p: any) => p.type === 'tripadvisor' && p.enabled);
        if (googleEntry?.place_id) googlePlaceId = googleEntry.place_id;
        if (taEntry?.id) tripadvisorId = taEntry.id;
      } else if (reviewPlatformsRaw && typeof reviewPlatformsRaw === 'object') {
        if (reviewPlatformsRaw.google?.place_id) googlePlaceId = reviewPlatformsRaw.google.place_id;
      }

      console.log(`Property ${property.name}: googlePlaceId="${googlePlaceId}", tripadvisorId="${tripadvisorId}"`);

      // --- AUTO-DISCOVER Google Place ID using Places API (New) ---
      if (!googlePlaceId && googleKey && property.name) {
        try {
          const searchText = `${property.name} ${property.address || ''} ${property.city || ''} ${property.country || ''}`.trim();
          console.log(`Auto-discovering Google Place ID for: "${searchText}"`);
          
          const searchResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
              'Referer': 'https://book.sleepinafrica.roomsonline.co.za',
            },
            body: JSON.stringify({
              textQuery: searchText,
              maxResultCount: 1,
            }),
          });
          const searchData = await searchResp.json();
          console.log(`Google Text Search response:`, JSON.stringify(searchData).substring(0, 500));
          
          if (searchData.places?.length > 0) {
            googlePlaceId = searchData.places[0].id;
            console.log(`Auto-discovered Google Place ID for ${property.name}: ${googlePlaceId}`);
            
            const updatedExternalIds = { ...externalIds, google_place_id: googlePlaceId };
            const updatedAmenities = { ...amenities, external_ids: updatedExternalIds };
            await supabase.from('properties').update({ amenities: updatedAmenities }).eq('id', property.id);
          }
        } catch (e) {
          console.error(`Google Place ID discovery failed for ${property.name}:`, e);
        }
      }

      // --- GOOGLE REVIEWS using Places API (New) ---
      // Skip numeric-only Place IDs — they're legacy and incompatible with Places API (New)
      const isNumericPlaceId = /^\d+$/.test(googlePlaceId);
      if (isNumericPlaceId && googlePlaceId) {
        console.warn(`Property ${property.name}: Google Place ID "${googlePlaceId}" is numeric (legacy format). Please update to a "ChIJ..." format ID in the property editor. Skipping Google API call, preserving cached data.`);
      }
      if (googlePlaceId && googleKey && !isNumericPlaceId) {
        try {
          const detailsResp = await fetch(`https://places.googleapis.com/v1/places/${googlePlaceId}`, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': googleKey,
              'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,reviews,googleMapsUri',
              'Referer': 'https://book.sleepinafrica.roomsonline.co.za',
            },
          });
          const placeData = await detailsResp.json();
          console.log(`Google Place Details for ${property.name}: rating=${placeData.rating}, reviews=${placeData.userRatingCount}`);

          if (placeData.rating || placeData.reviews) {
            const normalizedReviews = (placeData.reviews || []).map((r: any) => ({
              author: r.authorAttribution?.displayName || 'Guest',
              text: r.text?.text || r.originalText?.text || '',
              rating: r.rating || 0,
              date: r.publishTime || null,
              photo_url: r.authorAttribution?.photoUri || null,
              source_url: r.authorAttribution?.uri || null,
              relative_time: r.relativePublishTimeDescription || null,
            }));

            // Merge with existing reviews
            const { data: existing } = await supabase
              .from('property_review_cache')
              .select('reviews')
              .eq('property_id', property.id)
              .eq('source', 'google')
              .maybeSingle();

            const existingReviews = (existing?.reviews as any[]) || [];
            const allReviews = [...existingReviews];
            for (const nr of normalizedReviews) {
              const isDupe = allReviews.some(
                (er: any) => er.author === nr.author && er.text?.substring(0, 50) === nr.text?.substring(0, 50)
              );
              if (!isDupe) allReviews.push(nr);
            }
            allReviews.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            const finalReviews = allReviews.slice(0, 20);

            await supabase.from('property_review_cache').upsert({
              property_id: property.id,
              source: 'google',
              source_id: googlePlaceId,
              overall_rating: placeData.rating || null,
              total_reviews: placeData.userRatingCount || 0,
              rating_url: placeData.googleMapsUri || `https://search.google.com/local/reviews?placeid=${googlePlaceId}`,
              reviews: finalReviews,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'property_id,source' });

            results.push({ property: property.name, source: 'google', status: 'ok', reviews: finalReviews.length, rating: placeData.rating });
          }
        } catch (e) {
          console.error(`Google review sync failed for ${property.name}:`, e);
          results.push({ property: property.name, source: 'google', status: 'error', error: String(e) });
        }
      }

      // --- TRIPADVISOR REVIEWS ---
      if (tripadvisorId && tripadvisorKey) {
        try {
          const taBase = 'https://api.content.tripadvisor.com/api/v1';
          const origin = 'https://book.sleepinafrica.roomsonline.co.za';

          const detailsResp = await fetch(
            `${taBase}/location/${tripadvisorId}/details?language=en&currency=USD&key=${tripadvisorKey}`,
            { headers: { 'accept': 'application/json', 'Referer': origin } }
          );
          const detailsData = await detailsResp.json();

          const reviewsResp = await fetch(
            `${taBase}/location/${tripadvisorId}/reviews?language=en&limit=5&key=${tripadvisorKey}`,
            { headers: { 'accept': 'application/json', 'Referer': origin } }
          );
          const reviewsData = await reviewsResp.json();
          console.log(`TripAdvisor for ${property.name}: rating=${detailsData.rating}, reviews=${detailsData.num_reviews}, fetched=${reviewsData.data?.length || 0}`);
          
          // Log full response when no data found for debugging
          if (!detailsData.rating && (!reviewsData.data || reviewsData.data.length === 0)) {
            console.warn(`TripAdvisor empty response for ${property.name} (ID: ${tripadvisorId}). Details response:`, JSON.stringify(detailsData).substring(0, 500));
            console.warn(`TripAdvisor reviews response:`, JSON.stringify(reviewsData).substring(0, 500));
          }

          const normalizedReviews = (reviewsData.data || []).map((r: any) => ({
            author: r.user?.username || 'Traveler',
            text: r.text || r.title || '',
            rating: r.rating || 0,
            date: r.published_date || null,
            photo_url: r.user?.avatar?.small?.url || null,
            source_url: r.url || null,
            title: r.title || null,
          }));

          const { data: existing } = await supabase
            .from('property_review_cache')
            .select('reviews')
            .eq('property_id', property.id)
            .eq('source', 'tripadvisor')
            .maybeSingle();

          const existingReviews = (existing?.reviews as any[]) || [];
          const allReviews = [...existingReviews];
          for (const nr of normalizedReviews) {
            const isDupe = allReviews.some(
              (er: any) => er.author === nr.author && er.text?.substring(0, 50) === nr.text?.substring(0, 50)
            );
            if (!isDupe) allReviews.push(nr);
          }
          allReviews.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
          const finalReviews = allReviews.slice(0, 20);

          await supabase.from('property_review_cache').upsert({
            property_id: property.id,
            source: 'tripadvisor',
            source_id: tripadvisorId,
            overall_rating: detailsData.rating ? parseFloat(detailsData.rating) : null,
            total_reviews: parseInt(detailsData.num_reviews || '0', 10),
            rating_url: detailsData.web_url || `https://www.tripadvisor.com/${tripadvisorId}`,
            reviews: finalReviews,
            synced_at: new Date().toISOString(),
          }, { onConflict: 'property_id,source' });

          results.push({ property: property.name, source: 'tripadvisor', status: 'ok', reviews: finalReviews.length });
        } catch (e) {
          console.error(`TripAdvisor review sync failed for ${property.name}:`, e);
          results.push({ property: property.name, source: 'tripadvisor', status: 'error', error: String(e) });
        }
      }

      // --- TOBI BLURB via xAI ---
      if (xaiKey) {
        try {
          const { data: allCaches } = await supabase
            .from('property_review_cache')
            .select('reviews, source')
            .eq('property_id', property.id);

          const allReviewTexts: string[] = [];
          (allCaches || []).forEach((cache: any) => {
            const reviews = (cache.reviews as any[]) || [];
            reviews.slice(0, 5).forEach((r: any) => {
              if (r.text) allReviewTexts.push(`[${cache.source}] "${r.text.substring(0, 200)}"`);
            });
          });

          if (allReviewTexts.length > 0) {
            const prompt = `Based on these guest reviews for "${property.name}" in ${property.city}, ${property.country}, write a 2-3 sentence editorial summary of what guests consistently praise. Ground every claim in specific details from the reviews — mention particular features, qualities, or experiences that stand out. Write in third person as a travel editor. STRICT RULES: Do NOT start with "As TOBI" or any self-introduction. Do NOT use first person. Do NOT repeat the property name more than once. Do NOT use generic phrases like "hidden gem", "something for everyone", or "unforgettable". Just write the summary directly.

Reviews:
${allReviewTexts.slice(0, 8).join('\n')}

${property.description ? `Property description: ${property.description.substring(0, 300)}` : ''}`;

            const xaiResp = await fetch('https://api.x.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${xaiKey}`,
              },
              body: JSON.stringify({
                model: 'grok-3-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.7,
              }),
            });

            const xaiData = await xaiResp.json();
            const blurb = xaiData.choices?.[0]?.message?.content?.trim();

            if (blurb) {
              await supabase
                .from('property_review_cache')
                .update({ tobi_blurb: blurb })
                .eq('property_id', property.id);

              results.push({ property: property.name, source: 'tobi_blurb', status: 'ok' });
            }
          }
        } catch (e) {
          console.error(`TOBI blurb generation failed for ${property.name}:`, e);
        }
      }
    }

    console.log(`Sync completed: ${results.length} operations`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('sync-property-reviews error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
