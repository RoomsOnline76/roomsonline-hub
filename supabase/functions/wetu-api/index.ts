import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const WETU_API_KEY = Deno.env.get("WETU_API_KEY");
const WETU_BASE = "https://wetu.com/API/Pins";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface WetuImage { url?: string; URL?: string; thumbnail?: string; caption?: string; }
interface WetuFacility { name?: string; Name?: string; }
interface WetuProperty {
  name?: string; Name?: string;
  description?: string; Description?: string;
  teaser?: string; Teaser?: string; short_description?: string;
  latitude?: number | string; Latitude?: number | string;
  longitude?: number | string; Longitude?: number | string;
  address?: string; Address?: string;
  city?: string; City?: string;
  country?: string; Country?: string;
  images?: WetuImage[]; Images?: WetuImage[]; gallery?: WetuImage[];
  facilities?: WetuFacility[]; Facilities?: WetuFacility[];
  [k: string]: unknown;
}

function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
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
  const raw: WetuProperty = Array.isArray(wetuJson) ? wetuJson[0] : (wetuJson?.data?.[0] ?? wetuJson?.[0] ?? wetuJson);
  if (!raw) throw new Error(`No WETU pin found for id ${wetuId}`);

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

  const trySet = (field: string, value: unknown, currentEmpty: boolean) => {
    if (value === undefined || value === null || value === "") return;
    if (locked.has(field)) { skippedFields.push(`${field}(pms-locked)`); return; }
    if (!currentEmpty && field !== "description" && field !== "short_description" && field !== "images" && field !== "amenities") {
      skippedFields.push(`${field}(already-set)`); return;
    }
    update[field] = value;
    updatedFields.push(field);
  };

  const description = pick<string>(raw as Record<string, unknown>, "description", "Description");
  const teaser = pick<string>(raw as Record<string, unknown>, "teaser", "Teaser", "short_description");
  trySet("description", description, !property?.description);
  trySet("short_description", teaser, !property?.short_description);

  // Images — only with usable URL; size validation deferred to upload pipeline
  const rawImages = (pick<WetuImage[]>(raw as Record<string, unknown>, "images", "Images", "gallery") ?? []);
  const mappedImages = Array.isArray(rawImages)
    ? rawImages.map((i) => ({ url: i.url ?? i.URL, caption: i.caption ?? "" })).filter((i) => !!i.url)
    : [];
  if (mappedImages.length > 0 && !locked.has("images")) {
    update.images = mappedImages;
    updatedFields.push("images");
  }

  // Amenities — convert facility names to flat amenity map { name: true }
  const rawFacilities = pick<WetuFacility[]>(raw as Record<string, unknown>, "facilities", "Facilities") ?? [];
  if (Array.isArray(rawFacilities) && rawFacilities.length > 0 && !locked.has("amenities")) {
    const amenityMap: Record<string, boolean> = { ...(property?.amenities as Record<string, boolean> ?? {}) };
    for (const f of rawFacilities) {
      const name = (f.name ?? f.Name ?? "").toString().trim();
      if (name) amenityMap[name.toLowerCase().replace(/\s+/g, "_")] = true;
    }
    update.amenities = amenityMap;
    updatedFields.push("amenities");
  }

  const lat = pick<number | string>(raw as Record<string, unknown>, "latitude", "Latitude");
  const lng = pick<number | string>(raw as Record<string, unknown>, "longitude", "Longitude");
  trySet("latitude", lat !== undefined ? Number(lat) : undefined, property?.latitude === null || property?.latitude === undefined);
  trySet("longitude", lng !== undefined ? Number(lng) : undefined, property?.longitude === null || property?.longitude === undefined);
  trySet("address", pick<string>(raw as Record<string, unknown>, "address", "Address"), !property?.address);
  trySet("city", pick<string>(raw as Record<string, unknown>, "city", "City"), !property?.city);
  trySet("country", pick<string>(raw as Record<string, unknown>, "country", "Country"), !property?.country);

  update.wetu_id = wetuId;
  update.external_metadata = {
    ...(property?.external_metadata as Record<string, unknown> ?? {}),
    wetu_last_import_at: new Date().toISOString(),
    wetu_pin_id: wetuId,
  };

  const { error: updateErr } = await supabase.from("properties").update(update).eq("id", propertyId);
  if (updateErr) throw new Error(`Property update failed: ${updateErr.message}`);

  return {
    success: true,
    updated_fields: updatedFields,
    skipped_fields: skippedFields,
    image_count: mappedImages.length,
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

    const { action, property_id, search_terms, page_number } = await req.json();

    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'action' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let url: string;
    let response: Response;

    switch (action) {
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
