// Delete a white-label domain: unregisters it from Cloudflare (if a custom
// hostname is registered) and clears the DB row back to `unconfigured`.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const CF_ZONE_ID = Deno.env.get("CLOUDFLARE_ZONE_ID") || "";
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const ORIGIN_RULESET_PHASE = "http_request_origin";
const ORIGIN_RULE_REF_PREFIX = "roomsonline_whitelabel_origin_";
const REDIRECT_RULESET_PHASE = "http_request_dynamic_redirect";
const REDIRECT_RULE_REF_PREFIX = "roomsonline_whitelabel_redirect_";

const BodySchema = z.object({
  property_id: z.string().uuid().optional(),
  portfolio_id: z.string().uuid().optional(),
}).refine((v) => !!v.property_id || !!v.portfolio_id, {
  message: "property_id or portfolio_id is required",
});

async function cfDelete(id: string): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    await fetch(`${CF_API_BASE}/zones/${CF_ZONE_ID}/custom_hostnames/${id}`, {
      method: "DELETE",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.warn("cfDelete failed (ignored)", err);
  } finally {
    clearTimeout(t);
  }
}

interface CFRulesetRule {
  id?: string;
  ref?: string;
  expression: string;
  description?: string;
  action: string;
  action_parameters?: Record<string, unknown>;
  enabled?: boolean;
}

interface CFRuleset {
  id: string;
  name: string;
  description?: string;
  kind: string;
  phase: string;
  rules: CFRulesetRule[];
}

interface CFResult<T> {
  success: boolean;
  result?: T;
}

function cfSafeRef(hostname: string): string {
  return `${ORIGIN_RULE_REF_PREFIX}${hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`.slice(0, 128);
}

function cfSafeRedirectRef(hostname: string): string {
  return `${REDIRECT_RULE_REF_PREFIX}${hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`.slice(0, 128);
}

async function cfFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    return await fetch(`${CF_API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function cfDeleteOriginRoute(hostname: string): Promise<void> {
  try {
    const ref = cfSafeRef(hostname);
    const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`);
    const listed = (await listResponse.json()) as CFResult<CFRuleset[]>;
    const ruleset = listed.result?.find((r) => r.kind === "zone" && r.phase === ORIGIN_RULESET_PHASE);
    if (!listed.success || !ruleset) return;

    const nextRules = (ruleset.rules || []).filter((rule) =>
      rule.ref !== ref && rule.expression !== `http.host eq "${hostname}"`
    );
    if (nextRules.length === (ruleset.rules || []).length) return;

    await cfFetch(`/zones/${CF_ZONE_ID}/rulesets/${ruleset.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: ruleset.name,
        description: ruleset.description,
        kind: "zone",
        phase: ORIGIN_RULESET_PHASE,
        rules: nextRules,
      }),
    });
  } catch (err) {
    console.warn("cfDeleteOriginRoute failed (ignored)", err);
  }
}

async function cfDeleteCanonicalRedirect(hostname: string): Promise<void> {
  try {
    const ref = cfSafeRedirectRef(hostname);
    const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`);
    const listed = (await listResponse.json()) as CFResult<CFRuleset[]>;
    const ruleset = listed.result?.find((r) => r.kind === "zone" && r.phase === REDIRECT_RULESET_PHASE);
    if (!listed.success || !ruleset) return;

    const nextRules = (ruleset.rules || []).filter((rule) =>
      rule.ref !== ref && rule.expression !== `http.host eq "${hostname}"`
    );
    if (nextRules.length === (ruleset.rules || []).length) return;

    await cfFetch(`/zones/${CF_ZONE_ID}/rulesets/${ruleset.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: ruleset.name,
        description: ruleset.description,
        kind: "zone",
        phase: REDIRECT_RULESET_PHASE,
        rules: nextRules,
      }),
    });
  } catch (err) {
    console.warn("cfDeleteCanonicalRedirect failed (ignored)", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { property_id, portfolio_id } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let hostnameId: string | null = null;
    let hostname: string | null = null;
    if (portfolio_id) {
      const { data } = await supabase
        .from("property_portfolios")
        .select("cloudflare_custom_hostname_id, white_label_domain")
        .eq("id", portfolio_id)
        .maybeSingle();
      hostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
      hostname = (data as any)?.white_label_domain ?? null;
    } else if (property_id) {
      const { data } = await supabase
        .from("property_billing_configs")
        .select("cloudflare_custom_hostname_id, white_label_domain")
        .eq("property_id", property_id)
        .maybeSingle();
      hostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
      hostname = (data as any)?.white_label_domain ?? null;
    }

    if (hostnameId && CF_ZONE_ID && CF_API_TOKEN) {
      await cfDelete(hostnameId);
    }
    if (hostname && CF_ZONE_ID && CF_API_TOKEN) {
      await cfDeleteOriginRoute(hostname.toLowerCase());
      await cfDeleteCanonicalRedirect(hostname.toLowerCase());
    }

    const patch = {
      white_label_domain: null,
      white_label_domain_status: "unconfigured",
      white_label_domain_verified_at: null,
      white_label_domain_last_error: null,
      cloudflare_custom_hostname_id: null,
      custom_domain_error: null,
    } as any;

    if (portfolio_id) {
      await supabase.from("property_portfolios").update(patch).eq("id", portfolio_id);
    } else if (property_id) {
      await supabase.from("property_billing_configs").update(patch).eq("property_id", property_id);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("delete-whitelabel-domain error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
