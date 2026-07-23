// ============================================================================
// PriceLabs IAPI adapter
// Docs: https://help.pricelabs.co/portal/en/kb/articles/building-an-integration-with-pricelabs
// Swagger: https://app.swaggerhub.com/apis/PriceLabs/price-labs_connector/2.0.0
// ============================================================================
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BASE = "https://api.pricelabs.co/v2/integration/api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ENV_NAME = Deno.env.get("PRICELABS_INTEGRATION_NAME") ?? "";
const ENV_TOKEN = Deno.env.get("PRICELABS_INTEGRATION_TOKEN") ?? "";

type Json = Record<string, unknown>;
type SB = ReturnType<typeof createClient>;

async function getCreds(supabase: SB, propertyId?: string) {
  let name = ENV_NAME;
  let token = ENV_TOKEN;

  // Per-property override lives in properties.pricelabs_config.credentials
  if (propertyId) {
    try {
      const { data } = await supabase
        .from("properties")
        .select("pricelabs_config")
        .eq("id", propertyId)
        .maybeSingle();
      const cfg = ((data?.pricelabs_config ?? {}) as Json).credentials as Json | undefined;
      if (cfg && typeof cfg.integration_name === "string" && typeof cfg.integration_token === "string") {
        name = cfg.integration_name;
        token = cfg.integration_token;
      }
    } catch (_) { /* ignore */ }
  }

  if (!name || !token) throw new Error("PriceLabs credentials missing (PRICELABS_INTEGRATION_NAME / _TOKEN or property override)");
  return { name, token };
}

async function pl(method: "GET" | "POST", path: string, name: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Integration-Name": name,
      "X-Integration-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, body: json };
}

function stringifyBody(b: unknown): string {
  if (b == null) return "";
  if (typeof b === "string") return b;
  try { return JSON.stringify(b); } catch { return String(b); }
}

function plError(prefix: string, r: { status: number; body: unknown }): string {
  const bodyStr = stringifyBody(r.body);
  return `${prefix} (PriceLabs ${r.status})${bodyStr ? `: ${bodyStr.slice(0, 500)}` : ""}`;
}

// -------------------------------------------------------------------
// High-level ROLOS-specific actions
// -------------------------------------------------------------------

async function buildListingsPayload(supabase: SB, propertyId: string) {
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("id, name, pricelabs_config, latitude, longitude, city, country")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) throw new Error(`Property lookup failed: ${propErr.message}`);
  if (!property) throw new Error("Property not found");

  const cfg = (property.pricelabs_config ?? {}) as Json;
  const currency = (typeof cfg.currency === "string" && cfg.currency) || "ZAR";

  const { data: roomTypes } = await supabase
    .from("rolos_room_types")
    .select("id, name, base_occupancy, max_occupancy, default_rate")
    .eq("property_id", propertyId)
    .eq("is_active", true);

  const listings = (roomTypes ?? []).map((rt) => ({
    listing_id: `rolos_${propertyId}_${rt.id}`,
    name: `${property.name} — ${rt.name}`,
    currency,
    location: {
      latitude: property.latitude,
      longitude: property.longitude,
      city: property.city,
      country: property.country,
    },
    no_of_bedrooms: 1,
    max_occupancy: rt.max_occupancy ?? 2,
    base_price: Number(rt.default_rate ?? 0),
  }));

  return { property, listings, roomTypes: roomTypes ?? [] };
}

async function syncPropertyToPricelabs(supabase: SB, propertyId: string, name: string, token: string) {
  const { property, listings, roomTypes } = await buildListingsPayload(supabase, propertyId);
  if (listings.length === 0) return { success: false, status: 400, error: "No active room types found for this property. Add rooms in ROLOS → Room Types before pushing to PriceLabs." };

  const listingsRes = await pl("POST", "/listings", name, token, { listings });
  if (!listingsRes.ok) return { success: false, status: listingsRes.status, error: plError("Listings push failed", listingsRes) };

  // Push last 730 days of reservations. Room-type mapping lives on rolos_reservation_rooms.
  const since = new Date(Date.now() - 730 * 86400_000).toISOString().slice(0, 10);
  const { data: reservations } = await supabase
    .from("rolos_reservations")
    .select("id, check_in, check_out, total_amount, status, rolos_reservation_rooms(room_type_id)")
    .eq("property_id", propertyId)
    .gte("check_in", since);

  const reservationPayload = (reservations ?? [])
    .flatMap((r: Json) => {
      const rooms = (r.rolos_reservation_rooms as Array<{ room_type_id: string | null }> | null) ?? [];
      const roomTypeIds = Array.from(new Set(rooms.map((x) => x.room_type_id).filter(Boolean))) as string[];
      if (roomTypeIds.length === 0) return [];
      return roomTypeIds.map((rtId) => ({
        listing_id: `rolos_${propertyId}_${rtId}`,
        reservation_id: `${r.id}_${rtId}`,
        check_in: r.check_in,
        check_out: r.check_out,
        total_price: Number(r.total_amount ?? 0) / roomTypeIds.length,
        status: r.status,
      }));
    });

  let reservationsRes: unknown = null;
  if (reservationPayload.length > 0) {
    const r = await pl("POST", "/reservations", name, token, { reservations: reservationPayload });
    reservationsRes = r.body;
  }

  return {
    success: true,
    property_id: propertyId,
    property_name: property.name,
    listings_pushed: listings.length,
    reservations_pushed: reservationPayload.length,
    room_type_count: roomTypes.length,
    listings_response: listingsRes.body,
    reservations_response: reservationsRes,
  };
}

async function pullPriceSuggestions(supabase: SB, propertyId: string, name: string, token: string) {
  const { data: roomTypes } = await supabase
    .from("rolos_room_types")
    .select("id, default_rate")
    .eq("property_id", propertyId)
    .eq("is_active", true);

  if (!roomTypes || roomTypes.length === 0) return { success: false, status: 400, error: "No active room types for this property. Sync a property to PriceLabs before pulling suggestions." };

  const listingIds = roomTypes.map((rt) => `rolos_${propertyId}_${rt.id}`);
  const priced = await pl("POST", "/get_prices", name, token, { listing_ids: listingIds });
  if (!priced.ok) return { success: false, status: priced.status, error: plError("Pull suggestions failed", priced) };

  const body = (priced.body as Json | null) ?? {};
  const listingsOut = (body.listings as Array<Json> | undefined) ?? (body.data as Array<Json> | undefined) ?? [];

  // Load rate plans for the property (used for default association)
  const { data: ratePlans } = await supabase
    .from("rolos_rate_plans")
    .select("id, name")
    .eq("property_id", propertyId)
    .eq("is_active", true);

  const rows: Array<Json> = [];
  for (const l of listingsOut) {
    const lid = String(l.listing_id ?? l.id ?? "");
    const roomTypeId = lid.startsWith(`rolos_${propertyId}_`) ? lid.slice(`rolos_${propertyId}_`.length) : null;
    if (!roomTypeId) continue;

    const rt = roomTypes.find((r) => r.id === roomTypeId);
    const prices = (l.prices as Array<Json> | undefined) ?? (l.dates as Array<Json> | undefined) ?? [];

    for (const p of prices) {
      const date = String(p.date ?? p.day ?? "");
      const suggested = Number(p.price ?? p.suggested_price ?? 0);
      if (!date || !suggested) continue;
      rows.push({
        property_id: propertyId,
        room_type_id: roomTypeId,
        rate_plan_id: ratePlans?.[0]?.id ?? null,
        listing_id: lid,
        date,
        suggested_price: suggested,
        current_price: rt?.default_rate ?? null,
        occupancy: p.occupancy ?? p.demand ?? null,
        demand_signal: (p.demand_level ?? p.demand ?? null) as string | null,
        min_price: p.min_price ?? null,
        max_price: p.max_price ?? null,
        raw: p,
        pulled_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length > 0) {
    // Upsert in batches
    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk);
      const { error } = await supabase
        .from("pricelabs_price_suggestions")
        .upsert(batch, { onConflict: "property_id,room_type_id,rate_plan_id,date" });
      if (error) console.error("[pricelabs] upsert error:", error.message);
    }
  }

  // Stamp last_pull_at
  const { data: prop } = await supabase.from("properties").select("pricelabs_config").eq("id", propertyId).maybeSingle();
  const nextCfg = { ...((prop?.pricelabs_config ?? {}) as Json), last_pull_at: new Date().toISOString() };
  await supabase.from("properties").update({ pricelabs_config: nextCfg }).eq("id", propertyId);

  return { success: true, suggestions_upserted: rows.length };
}

async function applySuggestions(
  supabase: SB,
  propertyId: string,
  suggestionIds: string[],
  userId: string | null,
) {
  const { data: property } = await supabase
    .from("properties")
    .select("pricelabs_config")
    .eq("id", propertyId)
    .maybeSingle();
  const cfg = (property?.pricelabs_config ?? {}) as Json;
  const floor = Number(cfg.min_price_floor ?? 0);
  const ceiling = Number(cfg.max_price_ceiling ?? 0);

  const { data: suggestions } = await supabase
    .from("pricelabs_price_suggestions")
    .select("*")
    .in("id", suggestionIds)
    .eq("property_id", propertyId);

  if (!suggestions || suggestions.length === 0) return { success: false, status: 400, error: "No matching suggestions to apply. Pull latest suggestions first." };

  let applied = 0;
  const errors: string[] = [];

  for (const s of suggestions) {
    let price = Number(s.suggested_price);
    if (floor > 0) price = Math.max(price, floor);
    if (ceiling > 0) price = Math.min(price, ceiling);

    if (!s.rate_plan_id || !s.room_type_id) {
      errors.push(`Skipped suggestion ${s.id}: missing rate_plan or room_type`);
      continue;
    }

    // Upsert a 1-day season for this rate_plan_id at date s.date
    const seasonName = `PriceLabs ${s.date}`;
    // Find existing 1-day season for this plan+date
    const { data: existingSeason } = await supabase
      .from("rolos_rate_seasons")
      .select("id")
      .eq("rate_plan_id", s.rate_plan_id)
      .eq("start_date", s.date)
      .eq("end_date", s.date)
      .maybeSingle();

    let seasonId = existingSeason?.id as string | undefined;
    if (!seasonId) {
      const { data: newSeason, error: sErr } = await supabase
        .from("rolos_rate_seasons")
        .insert({
          rate_plan_id: s.rate_plan_id,
          name: seasonName,
          start_date: s.date,
          end_date: s.date,
        })
        .select("id")
        .single();
      if (sErr) { errors.push(`Season create failed for ${s.date}: ${sErr.message}`); continue; }
      seasonId = newSeason.id;
    }

    const { error: pErr } = await supabase
      .from("rolos_rate_prices")
      .upsert(
        { season_id: seasonId, room_type_id: s.room_type_id, base_rate: price },
        { onConflict: "season_id,room_type_id" },
      );
    if (pErr) { errors.push(`Price upsert failed for ${s.date}: ${pErr.message}`); continue; }

    await supabase
      .from("pricelabs_price_suggestions")
      .update({ applied_at: new Date().toISOString(), applied_by: userId, applied_price: price })
      .eq("id", s.id);

    applied++;
  }

  return { success: true, applied, total: suggestions.length, errors };
}

// -------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase service creds missing" }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const payload = await req.json().catch(() => ({}));
    const action = (payload.action as string) || "health_check";
    const propertyId = payload.property_id as string | undefined;

    // Resolve user for audit trail (best-effort; verify_jwt disabled)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.slice(7));
        userId = data.user?.id ?? null;
      } catch (_) { /* ignore */ }
    }

    const { name, token } = await getCreds(supabase, propertyId);

    switch (action) {
      case "health_check":
      case "get_integration": {
        const r = await pl("GET", "/integration", name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "sync_property_to_pricelabs": {
        if (!propertyId) return json({ error: "property_id required" }, 400);
        const res = await syncPropertyToPricelabs(supabase, propertyId, name, token);
        const status = (res as { success?: boolean }).success === false
          ? (Number((res as { status?: number }).status) >= 400 && Number((res as { status?: number }).status) < 600 ? Number((res as { status?: number }).status) : 502)
          : 200;
        return json(res, status);
      }

      case "pull_price_suggestions": {
        if (!propertyId) return json({ error: "property_id required" }, 400);
        const res = await pullPriceSuggestions(supabase, propertyId, name, token);
        const status = (res as { success?: boolean }).success === false
          ? (Number((res as { status?: number }).status) >= 400 && Number((res as { status?: number }).status) < 600 ? Number((res as { status?: number }).status) : 502)
          : 200;
        return json(res, status);
      }

      case "apply_suggestions": {
        if (!propertyId) return json({ error: "property_id required" }, 400);
        const ids = (payload.suggestion_ids as string[]) ?? [];
        if (ids.length === 0) return json({ error: "suggestion_ids required" }, 400);
        const res = await applySuggestions(supabase, propertyId, ids, userId);
        const status = (res as { success?: boolean }).success === false
          ? (Number((res as { status?: number }).status) >= 400 && Number((res as { status?: number }).status) < 600 ? Number((res as { status?: number }).status) : 502)
          : 200;
        return json(res, status);
      }

      case "get_listings": {
        const q = payload.listing_id ? `?listing_id=${encodeURIComponent(payload.listing_id as string)}` : "";
        const r = await pl("GET", `/listings${q}`, name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_prices": {
        const r = await pl("POST", "/get_prices", name, token, payload.body ?? { listing_ids: payload.listing_ids ?? [] });
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_sync_status": {
        const r = await pl("GET", "/sync_status", name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[pricelabs-api] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
