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
      .select("id, name, slug, city, description, images, brand_primary_color, brand_secondary_color, external_system, latitude, longitude, amenities, hero_video_url, brand_heading_text_color, brand_body_text_color, brand_muted_text_color, brand_light_bg_color, brand_dark_bg_color, payment_providers, payment_provider")
      .eq("is_active", true)
      .in("id", propertyIds);

    const includeStaticContent = url.searchParams.get("include_static_content") === "true";

    // --- Static content enrichment (optional) ---
    let policiesByProperty: Record<string, any[]> = {};
    let contactsByProperty: Record<string, any[]> = {};
    let registryMap = new Map<string, any>();

    if (includeStaticContent && propertyIds.length > 0) {
      const [
        { data: policies },
        { data: contacts },
        { data: registry },
      ] = await Promise.all([
        supabase
          .from("rolos_reservation_policies")
          .select("property_id, id, name, kind, rule, is_default")
          .in("property_id", propertyIds)
          .order("is_default", { ascending: false }),
        supabase
          .from("property_contact_details")
          .select("property_id, id, role, name, email, phone, hours, sort_order")
          .in("property_id", propertyIds)
          .eq("is_public", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("payment_gateway_registry")
          .select("gateway_key, display_name, payment_method, supported_currencies, supported_countries, is_active, website_url"),
      ]);

      (policies || []).forEach((p: any) => {
        (policiesByProperty[p.property_id] ||= []).push({
          id: p.id,
          name: p.name,
          kind: p.kind,
          is_default: p.is_default,
          rule: p.rule,
          description: p.rule?.description || null,
        });
      });

      (contacts || []).forEach((c: any) => {
        (contactsByProperty[c.property_id] ||= []).push(c);
      });

      (registry || []).forEach((r: any) => registryMap.set(r.gateway_key, r));
    }

    // --- Rate resolver (tiered) ---
    // 1) rolos_rate_prices.base_rate  (season-priced native rates)
    // 2) rolos_rate_plans.base_rate   (native plan default)
    // 3) rolos_room_types.default_rate (native room type default)
    // 4) hostfully_room_types.daily_rate (legacy mirror fallback)

    const [
      { data: rrtRows },
      { data: planRows },
      { data: seasonRows },
      { data: priceRows },
      { data: hostfullyRows },
    ] = await Promise.all([
      supabase
        .from("rolos_room_types")
        .select("property_id, default_rate, max_occupancy, images")
        .eq("is_active", true)
        .in("property_id", propertyIds),
      supabase
        .from("rolos_rate_plans")
        .select("id, property_id, base_rate")
        .eq("is_active", true)
        .in("property_id", propertyIds),
      supabase
        .from("rolos_rate_seasons")
        .select("id, rate_plan_id"),
      supabase
        .from("rolos_rate_prices")
        .select("season_id, base_rate"),
      supabase
        .from("hostfully_room_types")
        .select("property_id, daily_rate, max_guests, images")
        .eq("is_active", true)
        .in("property_id", propertyIds),
    ]);

    // Build plan -> property map, then season -> property map
    const planToProp: Record<string, string> = {};
    (planRows || []).forEach((p: any) => { planToProp[p.id] = p.property_id; });
    const seasonToProp: Record<string, string> = {};
    (seasonRows || []).forEach((s: any) => {
      const pid = planToProp[s.rate_plan_id];
      if (pid) seasonToProp[s.id] = pid;
    });

    type Agg = { minRate: number; count: number; maxGuests: number };
    const agg: Record<string, Agg> = {};
    const bump = (pid: string, rate: number | null, guests: number | null, addCount: boolean) => {
      if (!agg[pid]) agg[pid] = { minRate: Infinity, count: 0, maxGuests: 0 };
      if (typeof rate === "number" && rate > 0 && rate < agg[pid].minRate) agg[pid].minRate = rate;
      if (typeof guests === "number" && guests > agg[pid].maxGuests) agg[pid].maxGuests = guests;
      if (addCount) agg[pid].count++;
    };

    // Tier 1: seasonal prices
    (priceRows || []).forEach((pr: any) => {
      const pid = seasonToProp[pr.season_id];
      if (pid) bump(pid, pr.base_rate, null, false);
    });
    // Tier 2: plan base_rate
    (planRows || []).forEach((p: any) => bump(p.property_id, p.base_rate, null, false));
    // Native room counts + defaults (tier 3 + count/maxGuests source)
    const propsWithNativeRT = new Set<string>();
    (rrtRows || []).forEach((r: any) => {
      propsWithNativeRT.add(r.property_id);
      bump(r.property_id, r.default_rate, r.max_occupancy, true);
    });
    // Tier 4: hostfully mirror — only for properties without native room types
    (hostfullyRows || []).forEach((h: any) => {
      if (propsWithNativeRT.has(h.property_id)) return;
      bump(h.property_id, h.daily_rate, h.max_guests, true);
    });

    // Pool of room-level images per property (fallback when property has none)
    const roomImagesByProp: Record<string, string[]> = {};
    const collectRoomImg = (pid: string, imgs: unknown) => {
      if (!Array.isArray(imgs)) return;
      for (const it of imgs) {
        const url = typeof it === "string" ? it : (it as any)?.url;
        if (typeof url === "string" && url) {
          (roomImagesByProp[pid] ||= []).push(url);
        }
      }
    };
    (rrtRows || []).forEach((r: any) => collectRoomImg(r.property_id, r.images));
    (hostfullyRows || []).forEach((h: any) => collectRoomImg(h.property_id, h.images));

    const mapped = (properties || []).map((p: any) => {
      const images = p.images || [];
      let heroImage: string | null = Array.isArray(images) && images.length > 0
        ? (typeof images[0] === "string" ? images[0] : images[0]?.url || null)
        : null;
      if (!heroImage) {
        const pool = roomImagesByProp[p.id];
        if (pool && pool.length > 0) {
          heroImage = pool[Math.floor(Math.random() * pool.length)];
        }
      }
      const rm = agg[p.id];
      const amenities = p.amenities || {};
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        city: p.city,
        description: amenities.space_description || p.description,
        hero_image: heroImage,
        starting_rate: rm && rm.minRate !== Infinity ? rm.minRate : null,
        room_count: rm?.count || 0,
        max_guests: rm?.maxGuests || null,
        brand_primary_color: p.brand_primary_color || null,
        brand_secondary_color: (p as any).brand_secondary_color || null,
        external_system: p.external_system || null,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        key_highlights: amenities.key_highlights || null,
        space_description: amenities.space_description || null,
        hero_video_url: p.hero_video_url || null,
        brand_heading_text_color: p.brand_heading_text_color || null,
        brand_body_text_color: p.brand_body_text_color || null,
        brand_muted_text_color: p.brand_muted_text_color || null,
        brand_light_bg_color: p.brand_light_bg_color || null,
        brand_dark_bg_color: p.brand_dark_bg_color || null,
        ...(includeStaticContent ? {
          cancellation_policies: policiesByProperty[p.id] || [],
          contacts: contactsByProperty[p.id] || [],
          payment_methods: (() => {
            const keys = Array.isArray(p.payment_providers) && p.payment_providers.length > 0
              ? p.payment_providers
              : p.payment_provider ? [p.payment_provider] : [];
            return keys.map((key: string) => {
              const reg = registryMap.get(key);
              return {
                key,
                name: reg?.display_name || key,
                methods: Array.isArray(reg?.payment_method) ? reg.payment_method : (reg?.payment_method ? [reg.payment_method] : []),
                currencies: Array.isArray(reg?.supported_currencies) ? reg.supported_currencies : [],
                countries: Array.isArray(reg?.supported_countries) ? reg.supported_countries : [],
                is_active: reg?.is_active ?? true,
                website_url: reg?.website_url || null,
              };
            });
          })(),
        } : {}),
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
    const seenBlurbProperties = new Set<string>();
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
      // Deduplicate: only one TOBI blurb per property
      if (rc.tobi_blurb && !seenBlurbProperties.has(rc.property_id)) {
        seenBlurbProperties.add(rc.property_id);
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
