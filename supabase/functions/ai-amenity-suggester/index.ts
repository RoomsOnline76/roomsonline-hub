import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface CatalogueRow {
  id: number;
  name: string;
  category: string | null;
  scope: string | null;
}

const inScope = (row: CatalogueRow, scope: "property" | "unit") =>
  !row.scope || row.scope === "both" || row.scope === scope;

async function scrapeWebsite(url: string): Promise<string> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key || !url?.startsWith("http")) return "";
  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    const md: string = data?.data?.markdown || "";
    return md.slice(0, 18000);
  } catch (err) {
    console.error("firecrawl scrape failed", err);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { property_id, website_url } = await req.json();
    if (!property_id) return json({ success: false, error: "property_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const xaiKey = Deno.env.get("XAI_API_KEY");
    if (!xaiKey) return json({ success: false, error: "XAI_API_KEY is not configured" }, 500);

    const [propRes, roomsRes, catRes] = await Promise.all([
      supabase
        .from("properties")
        .select(
          "id, name, property_type, description, short_description, city, country, address, star_rating, property_url, amenities",
        )
        .eq("id", property_id)
        .single(),
      supabase
        .from("hostfully_room_types")
        .select("id, name, description, bedrooms, bathrooms, beds, bed_configuration, amenities")
        .eq("property_id", property_id)
        .eq("is_active", true),
      supabase
        .from("ru_amenities")
        .select("id, name, category, scope")
        .eq("is_active", true)
        .order("id"),
    ]);

    if (propRes.error || !propRes.data) {
      return json({ success: false, error: propRes.error?.message || "Property not found" }, 404);
    }

    const property = propRes.data as Record<string, unknown>;
    const rooms = (roomsRes.data || []) as Record<string, unknown>[];
    const catalogue = ((catRes.data || []) as CatalogueRow[]).filter(
      (row) => row.scope !== "hidden",
    );

    const propertyCatalogue = catalogue.filter((c) => inScope(c, "property"));
    const unitCatalogue = catalogue.filter((c) => inScope(c, "unit"));

    const siteUrl = (website_url as string) || (property.property_url as string) || "";
    const scraped = await scrapeWebsite(siteUrl);

    const amenitiesJson = (property.amenities || {}) as Record<string, unknown>;

    const context = {
      property: {
        name: property.name,
        type: property.property_type,
        stars: property.star_rating,
        city: property.city,
        country: property.country,
        address: property.address,
        description: property.description,
        short_description: property.short_description,
        existing_facilities: amenitiesJson.facilities ?? [],
        extra_notes: {
          breakfast: amenitiesJson.breakfast_options ?? null,
          self_catering: amenitiesJson.self_catering ?? null,
        },
      },
      units: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        beds: r.beds,
        bed_configuration: r.bed_configuration,
        existing_amenities: r.amenities ?? [],
      })),
      website_content: scraped || null,
    };

    const catLine = (rows: CatalogueRow[]) =>
      rows.map((r) => `${r.id}|${r.name}${r.category ? ` (${r.category})` : ""}`).join("\n");

    const prompt = `You are an OTA distribution content specialist for South African accommodation.
Using ONLY the evidence in the DATA block (property record, unit records and scraped website content), decide which amenities/facilities apply.

Rules:
- Never invent amenities that have no support in the evidence. If evidence is only implied by the property type or star rating, mark confidence "low".
- Prefer specific amenities over generic ones.
- Property-level suggestions must come from the PROPERTY CATALOGUE; unit-level suggestions must come from the UNIT CATALOGUE. Use the numeric IDs exactly as listed.
- Return one entry per unit listed in DATA.units (match by the given id).
- confidence must be one of "high", "medium", "low".
- reason must be a short phrase (max 12 words) citing the evidence.

PROPERTY CATALOGUE (id|name):
${catLine(propertyCatalogue)}

UNIT CATALOGUE (id|name):
${catLine(unitCatalogue)}

DATA:
${JSON.stringify(context)}

Respond with JSON only, shape:
{"property":[{"id":123,"name":"...","confidence":"high","reason":"..."}],
 "units":[{"unit_id":"<uuid>","unit_name":"...","amenities":[{"id":123,"name":"...","confidence":"high","reason":"..."}]}],
 "summary":"one sentence"}`;

    const aiResp = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-3-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You map accommodation evidence onto a fixed amenity dictionary. Reply with strict JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("xAI error", aiResp.status, text);
      return json(
        { success: false, error: `AI request failed (${aiResp.status})`, detail: text.slice(0, 500) },
        aiResp.status === 429 ? 429 : 502,
      );
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = String(raw).match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const propertyIds = new Set(propertyCatalogue.map((c) => c.id));
    const unitIds = new Set(unitCatalogue.map((c) => c.id));
    const nameById = new Map(catalogue.map((c) => [c.id, c.name]));
    const validUnits = new Set(rooms.map((r) => String(r.id)));

    const normaliseList = (list: unknown, allowed: Set<number>) =>
      (Array.isArray(list) ? list : [])
        .map((entry) => {
          const e = entry as Record<string, unknown>;
          const id = Number(e?.id);
          if (!Number.isFinite(id) || !allowed.has(id)) return null;
          const confidence = ["high", "medium", "low"].includes(String(e?.confidence))
            ? String(e.confidence)
            : "medium";
          return {
            id,
            name: nameById.get(id) || String(e?.name ?? id),
            confidence,
            reason: typeof e?.reason === "string" ? e.reason.slice(0, 120) : "",
          };
        })
        .filter(Boolean)
        .filter((entry, idx, arr) => arr.findIndex((o) => o!.id === entry!.id) === idx);

    const result = {
      success: true,
      used_website: Boolean(scraped),
      website_url: siteUrl || null,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      property: normaliseList(parsed.property, propertyIds),
      units: (Array.isArray(parsed.units) ? parsed.units : [])
        .map((entry) => {
          const e = entry as Record<string, unknown>;
          const unitId = String(e?.unit_id ?? "");
          if (!validUnits.has(unitId)) return null;
          const room = rooms.find((r) => String(r.id) === unitId);
          return {
            unit_id: unitId,
            unit_name: (room?.name as string) || String(e?.unit_name ?? "Unit"),
            amenities: normaliseList(e?.amenities, unitIds),
          };
        })
        .filter(Boolean),
    };

    return json(result);
  } catch (err) {
    console.error("ai-amenity-suggester error", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
