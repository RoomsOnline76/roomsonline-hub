import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const collectionSlug = url.searchParams.get("collection");

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug parameter required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch public property data
    const { data: property, error } = await supabase
      .from("properties")
      .select("id, name, slug, brand_primary_color, brand_secondary_color, brand_font_color, brand_logo_url, external_system, description, address, city, images, collections")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch room types summary
    const { data: rooms } = await supabase
      .from("hostfully_room_types")
      .select("id, name, daily_rate, max_guests, thumbnail_url, is_active")
      .eq("property_id", property.id)
      .eq("is_active", true)
      .order("name");

    // Fetch integration config to check if widget is enabled
    const { data: config } = await supabase
      .from("integration_configs")
      .select("is_active")
      .eq("property_id", property.id)
      .eq("integration_type", "widget")
      .single();

    const embedBaseUrl = `https://book.sleepinafrica.roomsonline.co.za/embed/property/${property.slug}`;

    // Apply collection branding overrides if requested
    let brandOverrides: any = null;
    if (collectionSlug && Array.isArray(property.collections)) {
      const collection = property.collections.find(
        (c: any) => c.slug === collectionSlug && c.is_active
      );
      if (collection) {
        brandOverrides = {
          collection_id: collection.collection_id,
          name: collection.name,
          primary_color: collection.branding?.primary_color,
          logo_url: collection.branding?.logo_url,
          pricing_rules: collection.pricing_rules,
          availability_rules: collection.availability_rules,
        };
      }
    }

    const response = {
      property: {
        id: property.id,
        name: property.name,
        slug: property.slug,
        description: property.description,
        address: property.address,
        city: property.city,
        brand: {
          primary_color: brandOverrides?.primary_color || property.brand_primary_color,
          secondary_color: property.brand_secondary_color,
          font_color: property.brand_font_color,
          logo_url: brandOverrides?.logo_url || property.brand_logo_url,
        },
        external_system: property.external_system,
        hero_image: Array.isArray(property.images) && property.images.length > 0
          ? ((property.images[0] as any)?.url || property.images[0])
          : null,
      },
      collection: brandOverrides,
      rooms: (rooms || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        daily_rate: r.daily_rate,
        max_guests: r.max_guests,
        thumbnail_url: r.thumbnail_url,
      })),
      widget_enabled: config?.is_active ?? true,
      embed_url: embedBaseUrl + (collectionSlug ? `?collection=${collectionSlug}` : ''),
      snippet: {
        simple: `<script src="https://widget.roomsonline.co.za/rol-embed.js"><\/script>\n<div data-rolos-property="${property.slug}"></div>`,
        branded: `<script src="https://widget.roomsonline.co.za/rol-embed.js"><\/script>\n<div data-rolos-property="${property.slug}"${property.brand_primary_color ? `\n     data-brand-color="${property.brand_primary_color}"` : ''}${property.brand_logo_url ? `\n     data-brand-logo="${property.brand_logo_url}"` : ''}></div>`,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
