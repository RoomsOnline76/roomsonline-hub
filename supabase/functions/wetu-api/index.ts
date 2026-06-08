import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const WETU_API_KEY = Deno.env.get("WETU_API_KEY");
const WETU_BASE = "https://wetu.com/API/Pins";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface WetuImage {
  url?: string;
  url_fragment?: string;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function snake(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function importToProperty(propertyId: string, wetuId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase service credentials missing in edge function");
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Fetch from WETU
  const wetuRes = await fetch(`${WETU_BASE}/${WETU_API_KEY}/Get?ids=${encodeURIComponent(wetuId)}`);
  if (!wetuRes.ok) {
    const text = await wetuRes.text();
    throw new Error(`WETU API ${wetuRes.status}: ${text}`);
  }
  const wetuJson = await wetuRes.json();
  const raw: Record<string, any> = Array.isArray(wetuJson) ? wetuJson[0] : (wetuJson?.data?.[0] ?? wetuJson?.[0] ?? wetuJson);
  if (!raw) throw new Error(`No WETU pin found for id ${wetuId}`);

  const content = (raw.content ?? {}) as Record<string, any>;
  const position = (raw.position ?? {}) as Record<string, any>;
  const features = (raw.features ?? {}) as Record<string, any>;
  const contact = (content.contact_information ?? {}) as Record<string, any>;

  // 2. Read current property to respect pms_managed_fields
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("description, short_description, images, amenities, latitude, longitude, address, city, country, pms_managed_fields, external_metadata")
    .eq("id", propertyId)
    .single();
  if (propErr) throw new Error(`Property fetch failed: ${propErr.message}`);

  const locked = new Set<string>((property?.pms_managed_fields as string[]) ?? []);
  const update: Record<string, unknown> = {};
  const updatedFields: string[] = [];
  const skippedFields: string[] = [];

  const OVERRIDE_FIELDS = new Set(["description", "short_description", "images", "amenities"]);
  const trySet = (field: string, value: unknown, currentEmpty: boolean) => {
    if (value === undefined || value === null || value === "") return;
    if (locked.has(field)) { skippedFields.push(`${field}(pms-locked)`); return; }
    if (!currentEmpty && !OVERRIDE_FIELDS.has(field)) {
      skippedFields.push(`${field}(already-set)`); return;
    }
    update[field] = value;
    updatedFields.push(field);
  };

  // Description: prefer extended (richer), fall back to general
  const description = (content.extended_description as string) || (content.general_description as string) || "";
  const shortText = stripHtml((content.general_description as string) || description);
  const short = shortText.length > 280 ? shortText.slice(0, 277).trimEnd() + "…" : shortText;
  trySet("description", description || undefined, !property?.description);
  trySet("short_description", short || undefined, !property?.short_description);

  // Images
  const rawImages: WetuImage[] = Array.isArray(content.images) ? content.images : [];
  const mapImg = (i: WetuImage) => ({
    url: i.url || (i.url_fragment ? `https://wetu.com/Resources/${i.url_fragment}` : undefined),
    caption: i.label || i.description || "",
    width: i.width,
    height: i.height,
  });
  const mappedImages = rawImages.map(mapImg).filter((i) => !!i.url);
  const sizedImages = mappedImages.filter((i) => (i.width ?? 0) >= 1024 && (i.height ?? 0) >= 683);
  const finalImages = sizedImages.length > 0 ? sizedImages : mappedImages;
  const persistImages = finalImages.map(({ url, caption }) => ({ url, caption }));
  if (persistImages.length > 0 && !locked.has("images")) {
    update.images = persistImages;
    updatedFields.push("images");
  } else if (locked.has("images")) {
    skippedFields.push("images(pms-locked)");
  }

  // Amenities — merge property_facilities, room_facilities, available_services
  const facilityArrays: string[][] = [
    Array.isArray(features.property_facilities) ? features.property_facilities : [],
    Array.isArray(features.room_facilities) ? features.room_facilities : [],
    Array.isArray(features.available_services) ? features.available_services : [],
  ];
  const flatFacilities = facilityArrays.flat().map((s) => String(s || "").trim()).filter(Boolean);
  if (flatFacilities.length > 0 && !locked.has("amenities")) {
    const amenityMap: Record<string, boolean> = { ...((property?.amenities as Record<string, boolean>) ?? {}) };
    for (const name of flatFacilities) {
      const key = snake(name);
      if (key) amenityMap[key] = true;
    }
    update.amenities = amenityMap;
    updatedFields.push("amenities");
  } else if (locked.has("amenities")) {
    skippedFields.push("amenities(pms-locked)");
  }

  // Geo + location
  const lat = position.latitude;
  const lng = position.longitude;
  trySet("latitude", typeof lat === "number" ? lat : (lat != null ? Number(lat) : undefined),
    property?.latitude === null || property?.latitude === undefined);
  trySet("longitude", typeof lng === "number" ? lng : (lng != null ? Number(lng) : undefined),
    property?.longitude === null || property?.longitude === undefined);
  trySet("address", contact.address as string | undefined, !property?.address);
  trySet("city", (position.area as string) || (position.location as string) || undefined, !property?.city);
  trySet("country", position.country as string | undefined, !property?.country);

  update.wetu_id = wetuId;
  update.external_metadata = {
    ...((property?.external_metadata as Record<string, unknown>) ?? {}),
    wetu_pin_id: wetuId,
    wetu_last_import_at: new Date().toISOString(),
    wetu_name: raw.name,
    wetu_stars: features.stars,
    wetu_rating: features.rating,
    wetu_check_in_time: features.check_in_time,
    wetu_check_out_time: features.check_out_time,
    wetu_contact: {
      email: contact.email,
      telephone: contact.telephone,
      website_url: contact.website_url,
      bookings_url: contact.bookings_url,
    },
  };

  const { error: updateErr } = await supabase.from("properties").update(update).eq("id", propertyId);
  if (updateErr) throw new Error(`Property update failed: ${updateErr.message}`);

  return {
    success: true,
    updated_fields: updatedFields,
    skipped_fields: skippedFields,
    image_count: persistImages.length,
    raw_image_count: rawImages.length,
    name: raw.name,
  };
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!WETU_API_KEY) {
      return new Response(
        JSON.stringify({ error: "WETU_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, property_id, search_terms, page_number, wetu_id } = body;

    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'action' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let url: string;
    let response: Response;

    switch (action) {
      case "import_to_property": {
        if (!property_id || typeof property_id !== "string") {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'property_id'" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!wetu_id || (typeof wetu_id !== "string" && typeof wetu_id !== "number")) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'wetu_id'" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const result = await importToProperty(property_id, String(wetu_id).trim());
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "health_check":
        url = `${WETU_BASE}/${WETU_API_KEY}/List?suppliers=y`;
        response = await fetch(url);
        if (!response.ok) {
          return new Response(
            JSON.stringify({ status: "error", message: `WETU API returned ${response.status}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ status: "healthy", message: "WETU API key is valid" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "list_properties":
        url = `${WETU_BASE}/${WETU_API_KEY}/List?suppliers=y`;
        response = await fetch(url);
        break;

      case "get_property":
        if (!property_id || typeof property_id !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'property_id' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        url = `${WETU_BASE}/${WETU_API_KEY}/Get?ids=${encodeURIComponent(property_id)}`;
        response = await fetch(url);
        break;

      case "search":
        if (!search_terms || typeof search_terms !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'search_terms' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        url = `${WETU_BASE}/${WETU_API_KEY}/Search/${encodeURIComponent(search_terms)}`;
        response = await fetch(url);
        break;

      case "get_paged":
        const pageNum = page_number && typeof page_number === "number" ? page_number : 1;
        url = `${WETU_BASE}/${WETU_API_KEY}/GetPinsWithPaging?pageNumber=${pageNum}`;
        response = await fetch(url);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Supported: health_check, list_properties, get_property, search, get_paged` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `WETU API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
