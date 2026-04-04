import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const portfolioSlug = url.searchParams.get("portfolio");

    if (!portfolioSlug) {
      return new Response(JSON.stringify({ error: "portfolio parameter required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch portfolio
    const { data: portfolio, error: pfError } = await supabase
      .from("property_portfolios")
      .select("id, name, slug, metadata")
      .eq("slug", portfolioSlug)
      .single();

    if (pfError || !portfolio) {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch members
    const { data: members } = await supabase
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", portfolio.id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({
        portfolio: { name: portfolio.name, slug: portfolio.slug, branding: portfolio.metadata?.branding || {} },
        properties: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const propertyIds = members.map((m: any) => m.property_id);

    // Fetch properties
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, slug, city, description, images, brand_primary_color, external_system, latitude, longitude, amenities")
      .eq("is_active", true)
      .in("id", propertyIds);

    // Fetch room summaries
    const { data: rooms } = await supabase
      .from("hostfully_room_types")
      .select("property_id, daily_rate, max_guests")
      .eq("is_active", true)
      .in("property_id", propertyIds);

    const roomsByProp: Record<string, { count: number; minRate: number; maxGuests: number }> = {};
    (rooms || []).forEach((r: any) => {
      if (!roomsByProp[r.property_id]) {
        roomsByProp[r.property_id] = { count: 0, minRate: Infinity, maxGuests: 0 };
      }
      roomsByProp[r.property_id].count++;
      if (r.daily_rate && r.daily_rate < roomsByProp[r.property_id].minRate) {
        roomsByProp[r.property_id].minRate = r.daily_rate;
      }
      if (r.max_guests && r.max_guests > roomsByProp[r.property_id].maxGuests) {
        roomsByProp[r.property_id].maxGuests = r.max_guests;
      }
    });

    const mapped = (properties || []).map((p: any) => {
      const images = p.images || [];
      const heroImage = Array.isArray(images) && images.length > 0
        ? (typeof images[0] === "string" ? images[0] : images[0]?.url || null)
        : null;
      const rm = roomsByProp[p.id];
      const amenities = p.amenities || {};
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        city: p.city,
        description: amenities.space_description || p.description,
        hero_image: heroImage,
        starting_rate: rm?.minRate === Infinity ? null : rm?.minRate || null,
        room_count: rm?.count || 0,
        max_guests: rm?.maxGuests || null,
        brand_primary_color: p.brand_primary_color || null,
        external_system: p.external_system || null,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        key_highlights: amenities.key_highlights || null,
        space_description: amenities.space_description || null,
      };
    });

    // Fetch active public specials for member properties
    const today = new Date().toISOString().split("T")[0];
    const { data: specials, error: specialsError } = await supabase
      .from("property_specials")
      .select("id, name, description, special_type, discount_percent, fixed_amount, fixed_price, currency, valid_from, valid_to, property_id")
      .eq("is_active", true)
      .eq("is_public", true)
      .gte("valid_to", today)
      .in("property_id", propertyIds);

    if (specialsError) {
      console.error("Specials query error:", specialsError);
    }
    console.log("Specials found:", specials?.length || 0, "for propertyIds:", propertyIds);

    const mappedSpecials = (specials || []).map((s: any) => {
      const prop = (properties || []).find((p: any) => p.id === s.property_id);
      // Compute a unified discount_type and discount_value for the UI
      let discount_type = s.special_type || "percentage";
      let discount_value = s.discount_percent || s.fixed_amount || s.fixed_price || 0;
      if (s.discount_percent) { discount_type = "percentage"; discount_value = s.discount_percent; }
      else if (s.fixed_amount) { discount_type = "fixed_amount"; discount_value = s.fixed_amount; }
      else if (s.fixed_price) { discount_type = "fixed_price"; discount_value = s.fixed_price; }

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        discount_type,
        discount_value,
        currency: s.currency || "ZAR",
        valid_from: s.valid_from,
        valid_to: s.valid_to,
        property_id: s.property_id,
        property_name: prop?.name || null,
        property_slug: prop?.slug || null,
      };
    });

    // Fetch reviews for all member properties
    const { data: reviewCaches } = await supabase
      .from("property_review_cache")
      .select("property_id, source, overall_rating, total_reviews, reviews, tobi_blurb")
      .in("property_id", propertyIds);

    const reviewsByProperty: Record<string, any[]> = {};
    const tobiBlurbs: { property_name: string; blurb: string }[] = [];
    (reviewCaches || []).forEach((rc: any) => {
      if (!reviewsByProperty[rc.property_id]) reviewsByProperty[rc.property_id] = [];
      const propName = (properties || []).find((p: any) => p.id === rc.property_id)?.name || "";
      // Top 2 reviews per source per property
      const sourceReviews = (rc.reviews || []).slice(0, 2).map((r: any) => ({
        ...r,
        source: rc.source,
        property_name: propName,
      }));
      reviewsByProperty[rc.property_id].push(...sourceReviews);
      if (rc.tobi_blurb) {
        tobiBlurbs.push({ property_name: propName, blurb: rc.tobi_blurb });
      }
    });

    // Flatten and sort by date, take top 10
    const allReviews = Object.values(reviewsByProperty).flat()
      .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 10);

    // AI enrichment when ?ai=true
    const wantAi = url.searchParams.get("ai") === "true";
    let aiData: Record<string, unknown> = {};

    if (wantAi && propertyIds.length > 0) {
      // Simple in-memory TTL cache
      const cacheKey = `portfolio_ai_${portfolio.slug}`;
      const now = Date.now();
      const cached = (globalThis as any).__aiCache?.[cacheKey];
      if (cached && now - cached.ts < 300_000) {
        aiData = cached.data;
      } else {
        // Check if any member property has experience engine enabled
        const { data: uiConfigs } = await supabase
          .from("rolos_ui_configs")
          .select("property_id, experience_engine_enabled")
          .in("property_id", propertyIds)
          .eq("experience_engine_enabled", true)
          .limit(1);

        if (uiConfigs && uiConfigs.length > 0) {
          const enginePropertyId = uiConfigs[0].property_id;
          try {
            const eeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/experience-engine`;
            const eeResponse = await fetch(eeUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                property_id: enginePropertyId,
                experience_type: "portfolio",
                payload: { action: "recommend", portfolio_id: portfolio.id },
              }),
            });

            if (eeResponse.ok) {
              const eeResult = await eeResponse.json();
              const d = eeResult?.data || eeResult;
              aiData = {
                ai_groups: d.semantic_groups || [],
                ai_bundles: d.bundles || [],
                ai_featured: d.featured || null,
              };
              // Cache
              if (!(globalThis as any).__aiCache) (globalThis as any).__aiCache = {};
              (globalThis as any).__aiCache[cacheKey] = { ts: now, data: aiData };
            }
          } catch (aiErr) {
            console.warn("AI enrichment failed:", aiErr);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      portfolio: {
        name: portfolio.name,
        slug: portfolio.slug,
        branding: portfolio.metadata?.branding || {},
      },
      properties: mapped,
      specials: mappedSpecials,
      reviews: allReviews,
      tobi_blurbs: tobiBlurbs,
      ...aiData,
      snippet: `<div data-rolos-portfolio="${portfolio.slug}"></div>\n<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
