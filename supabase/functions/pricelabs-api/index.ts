// ============================================================================
// PriceLabs IAPI adapter
// Docs: https://help.pricelabs.co/portal/en/kb/articles/building-an-integration-with-pricelabs
// Swagger: https://app.swaggerhub.com/apis/PriceLabs/price-labs_connector/2.0.0
// ============================================================================
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BASE = "https://api.pricelabs.co/v2/integration/api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Token may be rotated via /integration { regenerate_token: true }.
// We always read latest from `integration_configs` (system='pricelabs'), falling back to env.
const ENV_NAME = Deno.env.get("PRICELABS_INTEGRATION_NAME") ?? "";
const ENV_TOKEN = Deno.env.get("PRICELABS_INTEGRATION_TOKEN") ?? "";

type Json = Record<string, unknown>;

async function getCreds(supabase: ReturnType<typeof createClient>) {
  let name = ENV_NAME;
  let token = ENV_TOKEN;
  try {
    const { data } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("system", "pricelabs")
      .eq("config_key", "credentials")
      .maybeSingle();
    const cfg = (data?.config ?? {}) as Json;
    if (typeof cfg.integration_name === "string" && cfg.integration_name) name = cfg.integration_name as string;
    if (typeof cfg.integration_token === "string" && cfg.integration_token) token = cfg.integration_token as string;
  } catch (_) { /* table may not exist yet — fall back to env */ }
  if (!name || !token) throw new Error("PriceLabs credentials missing (PRICELABS_INTEGRATION_NAME / _TOKEN)");
  return { name, token };
}

async function persistToken(supabase: ReturnType<typeof createClient>, name: string, token: string) {
  try {
    await supabase
      .from("integration_configs")
      .upsert(
        { system: "pricelabs", config_key: "credentials", config: { integration_name: name, integration_token: token, updated_at: new Date().toISOString() } },
        { onConflict: "system,config_key" },
      );
  } catch (e) {
    console.warn("[pricelabs] persistToken failed:", (e as Error).message);
  }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase service creds missing" }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const payload = await req.json().catch(() => ({}));
    const action = (payload.action as string) || "health_check";
    const { name, token } = await getCreds(supabase);

    switch (action) {
      case "health_check":
      case "get_integration": {
        const r = await pl("GET", "/integration", name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "set_integration": {
        // Configure sync_url, calendar_trigger_url, hook_url, features, optional regenerate_token.
        const integration: Json = {};
        for (const k of ["sync_url", "calendar_trigger_url", "hook_url", "features", "regenerate_token"]) {
          if (payload[k] !== undefined) integration[k] = payload[k];
        }
        const r = await pl("POST", "/integration", name, token, { integration });
        if (r.ok && integration.regenerate_token === true) {
          const body = (r.body as Json | null) ?? {};
          const inner = (body.integration as Json | undefined) ?? body;
          const newToken = (inner?.["integration_token"] ?? inner?.["token"]) as string | undefined;
          if (newToken) await persistToken(supabase, name, newToken);
        }
        return json({ success: r.ok, status: r.status, data: r.body });
      }


      case "push_listings": {
        // payload.listings: array per Swagger schema
        const r = await pl("POST", "/listings", name, token, { listings: payload.listings ?? [] });
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_listings": {
        const q = payload.listing_id ? `?listing_id=${encodeURIComponent(payload.listing_id as string)}` : "";
        const r = await pl("GET", `/listings${q}`, name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "push_calendar": {
        const r = await pl("POST", "/calendar", name, token, payload.body ?? payload);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_calendar": {
        const r = await pl("GET", "/calendar", name, token);
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_prices": {
        const r = await pl("POST", "/get_prices", name, token, payload.body ?? { listing_ids: payload.listing_ids ?? [] });
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "push_reservations": {
        const r = await pl("POST", "/reservations", name, token, { reservations: payload.reservations ?? [] });
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "push_rate_plans": {
        const r = await pl("POST", "/rate_plans", name, token, { rate_plans: payload.rate_plans ?? [] });
        return json({ success: r.ok, status: r.status, data: r.body });
      }

      case "get_status": {
        const r = await pl("POST", "/status", name, token, payload.body ?? {});
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
