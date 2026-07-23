// White-label domain lifecycle handler.
//
// Flow: customer points a CNAME at CLOUDFLARE_FALLBACK_ORIGIN and clicks
// Verify. We check DNS, register the hostname on Cloudflare for SaaS
// (Custom Hostnames) so Cloudflare provisions a real DV TLS cert, then attach
// a single reusable Worker reverse-proxy route for the hostname. This scales to
// hundreds of customer domains without adding each domain to Vercel and without
// requiring Cloudflare Origin Rules / HostHeader override entitlement.
//
// Statuses:
//   unconfigured       — no domain saved
//   pending            — DNS not yet resolvable / no records at all
//   pending_ssl        — DNS OK, Cloudflare is issuing / validating cert
//   dns_ok_tls_pending — legacy synonym of pending_ssl (kept for old rows)
//   failed             — DNS points elsewhere or CF returned a hard error
//   active             — DNS OK + Cloudflare hostname + SSL both active
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const EXPECTED_CNAME_HOSTS = [
  (Deno.env.get("CLOUDFLARE_FALLBACK_ORIGIN") || "fallback.roomsonline.co.za").toLowerCase(),
  "sleepinafrica.roomsonline.co.za",
  "roomsonline.co.za",
];
const EXPECTED_A_RECORD = "185.158.133.1";

const CF_ZONE_ID = Deno.env.get("CLOUDFLARE_ZONE_ID") || "";
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
const CF_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const ORIGIN_RULESET_PHASE = "http_request_origin";
const ORIGIN_RULESET_NAME = "RoomsOnline white-label origin routing";
const ORIGIN_RULE_REF_PREFIX = "roomsonline_whitelabel_origin_";
const REDIRECT_RULESET_PHASE = "http_request_dynamic_redirect";
const REDIRECT_RULESET_NAME = "RoomsOnline white-label canonical redirects";
const REDIRECT_RULE_REF_PREFIX = "roomsonline_whitelabel_redirect_";
const CANONICAL_BOOKING_HOST = "sleepinafrica.roomsonline.co.za";
const WORKER_SCRIPT_NAME = Deno.env.get("CLOUDFLARE_WHITELABEL_WORKER") || "roomsonline-whitelabel-proxy";

type Status =
  | "active"
  | "failed"
  | "pending"
  | "pending_ssl"
  | "dns_ok_tls_pending";

const BodySchema = z.object({
  property_id: z.string().uuid().optional(),
  portfolio_id: z.string().uuid().optional(),
  domain: z.string().min(4).max(255).regex(/^[a-z0-9.-]+$/i),
}).refine((v) => !!v.property_id || !!v.portfolio_id, {
  message: "property_id or portfolio_id is required",
});

interface DohRecord { name: string; type: number; TTL: number; data: string }
interface DohResponse { Status: number; Answer?: DohRecord[] }

async function doh(name: string, type: "CNAME" | "A"): Promise<DohRecord[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const r = await fetch(url, { headers: { accept: "application/dns-json" } });
    if (!r.ok) return [];
    const json = (await r.json()) as DohResponse;
    return json.Answer || [];
  } catch {
    return [];
  }
}

async function cfFetch(path: string, init: RequestInit = {}, retries = 1): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${CF_API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (r.status >= 500 && retries > 0) {
      return await cfFetch(path, init, retries - 1);
    }
    return r;
  } catch (err) {
    if (retries > 0) return await cfFetch(path, init, retries - 1);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

interface CFHostname {
  id: string;
  hostname: string;
  status: string; // pending | active | blocked | moved | deleted | pending_deletion | pending_blocked | pending_migration
  ssl: {
    status: string; // pending_validation | pending_issuance | pending_deployment | active | ...
    validation_errors?: Array<{ message: string }>;
  };
  verification_errors?: string[];
}

interface CFResult<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: T;
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

interface CFWorkerRoute {
  id: string;
  pattern: string;
  script: string | null;
}

function cfSafeRef(hostname: string): string {
  return `${ORIGIN_RULE_REF_PREFIX}${hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`.slice(0, 128);
}

function cfSafeRedirectRef(hostname: string): string {
  return `${REDIRECT_RULE_REF_PREFIX}${hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`.slice(0, 128);
}

function requiresRedirectFallback(error: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("not entitled") || lower.includes("hostheader override") || lower.includes("host header");
}

function workerScriptSource(): string {
  return `const CANONICAL_ORIGIN = "https://${CANONICAL_BOOKING_HOST}";

addEventListener("fetch", (event) => {
  event.respondWith(proxyToCanonical(event.request));
});

async function proxyToCanonical(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, CANONICAL_ORIGIN);
  const headers = new Headers(request.headers);

  headers.set("x-rooms-original-host", incomingUrl.hostname);
  headers.set("x-forwarded-host", incomingUrl.hostname);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const response = await fetch(targetUrl.toString(), init);
  const responseHeaders = new Headers(response.headers);
  const location = responseHeaders.get("location");

  if (location) {
    try {
      const locationUrl = new URL(location, targetUrl.toString());
      if (locationUrl.hostname === new URL(CANONICAL_ORIGIN).hostname) {
        locationUrl.protocol = incomingUrl.protocol;
        locationUrl.hostname = incomingUrl.hostname;
        responseHeaders.set("location", locationUrl.toString());
      }
    } catch (_err) {
      // Keep the original location header if it is not parseable.
    }
  }

  responseHeaders.set("x-rooms-whitelabel-proxy", "worker");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
`;
}

async function cfEnsureWorkerScript(): Promise<{ ok: boolean; error: string | null }> {
  if (!CF_ACCOUNT_ID) {
    return {
      ok: false,
      error: "Cloudflare account id is not configured. Add CLOUDFLARE_ACCOUNT_ID so the scalable white-label Worker can be deployed.",
    };
  }

  const uploadedResponse = await cfFetch(`/accounts/${CF_ACCOUNT_ID}/workers/scripts/${WORKER_SCRIPT_NAME}`, {
    method: "PUT",
    headers: { "Content-Type": "application/javascript" },
    body: workerScriptSource(),
  });
  const uploaded = (await uploadedResponse.json()) as CFResult<unknown>;
  if (!uploaded.success) {
    return { ok: false, error: `Cloudflare Worker deploy failed: ${cfErrorMessage(uploaded)}` };
  }
  return { ok: true, error: null };
}

async function cfEnsureWorkerRoute(hostname: string): Promise<{ ok: boolean; error: string | null }> {
  const script = await cfEnsureWorkerScript();
  if (!script.ok) return script;

  const pattern = `${hostname}/*`;
  const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/workers/routes?per_page=100`);
  const listed = (await listResponse.json()) as CFResult<CFWorkerRoute[]>;
  if (!listed.success || !listed.result) {
    return { ok: false, error: `Cloudflare Worker route check failed: ${cfErrorMessage(listed)}` };
  }

  const existing = listed.result.find((route) => route.pattern.toLowerCase() === pattern.toLowerCase()) ?? null;
  const payload = { pattern, script: WORKER_SCRIPT_NAME };
  const routeResponse = await cfFetch(
    existing ? `/zones/${CF_ZONE_ID}/workers/routes/${existing.id}` : `/zones/${CF_ZONE_ID}/workers/routes`,
    {
      method: existing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    },
  );
  const routed = (await routeResponse.json()) as CFResult<CFWorkerRoute>;
  if (!routed.success || !routed.result) {
    return { ok: false, error: `Cloudflare Worker route failed: ${cfErrorMessage(routed)}` };
  }
  return { ok: true, error: null };
}

async function cfEnsureCanonicalRedirect(hostname: string): Promise<{ ok: boolean; error: string | null }> {
  const ref = cfSafeRedirectRef(hostname);
  const desiredRule: CFRulesetRule = {
    ref,
    expression: `http.host eq "${hostname}"`,
    description: `Redirect ${hostname} to the canonical RoomsOnline booking host`,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 302,
        preserve_query_string: true,
        target_url: {
          expression: `concat("https://${CANONICAL_BOOKING_HOST}", http.request.uri.path)`,
        },
      },
    },
  };

  const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`);
  const listed = (await listResponse.json()) as CFResult<CFRuleset[]>;
  if (!listed.success || !listed.result) {
    return { ok: false, error: `Cloudflare redirect check failed: ${cfErrorMessage(listed)}` };
  }

  let ruleset = listed.result.find((r) => r.kind === "zone" && r.phase === REDIRECT_RULESET_PHASE) ?? null;
  if (!ruleset) {
    const createdResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: REDIRECT_RULESET_NAME,
        description: "Keeps white-label booking domains functional when host-header origin routing is unavailable.",
        kind: "zone",
        phase: REDIRECT_RULESET_PHASE,
        rules: [desiredRule],
      }),
    });
    const created = (await createdResponse.json()) as CFResult<CFRuleset>;
    if (!created.success || !created.result) {
      return { ok: false, error: `Cloudflare redirect create failed: ${cfErrorMessage(created)}` };
    }
    return { ok: true, error: null };
  }

  const existingRules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
  const ruleIndex = existingRules.findIndex((r) => r.ref === ref || r.expression === desiredRule.expression);
  const nextRules = ruleIndex >= 0
    ? existingRules.map((r, i) => (i === ruleIndex ? { ...r, ...desiredRule } : r))
    : [...existingRules, desiredRule];

  const updatedResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: ruleset.name || REDIRECT_RULESET_NAME,
      description: ruleset.description || "Keeps white-label booking domains functional when host-header origin routing is unavailable.",
      kind: "zone",
      phase: REDIRECT_RULESET_PHASE,
      rules: nextRules,
    }),
  });
  const updated = (await updatedResponse.json()) as CFResult<CFRuleset>;
  if (!updated.success || !updated.result) {
    return { ok: false, error: `Cloudflare redirect update failed: ${cfErrorMessage(updated)}` };
  }
  return { ok: true, error: null };
}

async function cfEnsureOriginRoute(hostname: string): Promise<{ ok: boolean; error: string | null }> {
  const ref = cfSafeRef(hostname);
  const desiredRule: CFRulesetRule = {
    ref,
    expression: `http.host eq "${hostname}"`,
    description: `Route ${hostname} to ${EXPECTED_CNAME_HOSTS[0]} for Vercel fallback hosting`,
    action: "route",
    action_parameters: {
      host_header: EXPECTED_CNAME_HOSTS[0],
      origin: { host: EXPECTED_CNAME_HOSTS[0] },
    },
  };

  const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`);
  const listed = (await listResponse.json()) as CFResult<CFRuleset[]>;
  if (!listed.success || !listed.result) {
    return { ok: false, error: `Cloudflare origin routing check failed: ${cfErrorMessage(listed)}` };
  }

  let ruleset = listed.result.find((r) => r.kind === "zone" && r.phase === ORIGIN_RULESET_PHASE) ?? null;
  if (!ruleset) {
    const createdResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: ORIGIN_RULESET_NAME,
        description: "Routes white-label booking domains to the shared Vercel fallback origin.",
        kind: "zone",
        phase: ORIGIN_RULESET_PHASE,
        rules: [desiredRule],
      }),
    });
    const created = (await createdResponse.json()) as CFResult<CFRuleset>;
    if (!created.success || !created.result) {
      return { ok: false, error: `Cloudflare origin routing create failed: ${cfErrorMessage(created)}` };
    }
    return { ok: true, error: null };
  }

  const existingRules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
  const ruleIndex = existingRules.findIndex((r) => r.ref === ref || r.expression === desiredRule.expression);
  const nextRules = ruleIndex >= 0
    ? existingRules.map((r, i) => (i === ruleIndex ? { ...r, ...desiredRule } : r))
    : [...existingRules, desiredRule];

  const updatedResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets/${ruleset.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: ruleset.name || ORIGIN_RULESET_NAME,
      description: ruleset.description || "Routes white-label booking domains to the shared Vercel fallback origin.",
      kind: "zone",
      phase: ORIGIN_RULESET_PHASE,
      rules: nextRules,
    }),
  });
  const updated = (await updatedResponse.json()) as CFResult<CFRuleset>;
  if (!updated.success || !updated.result) {
    return { ok: false, error: `Cloudflare origin routing update failed: ${cfErrorMessage(updated)}` };
  }
  return { ok: true, error: null };
}

async function cfCreateHostname(hostname: string): Promise<CFResult<CFHostname>> {
  const body = {
    hostname,
    custom_origin_server: EXPECTED_CNAME_HOSTS[0],
    ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
  };
  const r = await cfFetch(`/zones/${CF_ZONE_ID}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return await r.json();
}

async function cfGetHostname(id: string): Promise<CFResult<CFHostname>> {
  const r = await cfFetch(`/zones/${CF_ZONE_ID}/custom_hostnames/${id}`);
  return await r.json();
}

async function cfFindHostnameByName(hostname: string): Promise<CFHostname | null> {
  const r = await cfFetch(`/zones/${CF_ZONE_ID}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
  const json = (await r.json()) as CFResult<CFHostname[]>;
  if (!json.success || !json.result || json.result.length === 0) return null;
  return json.result.find((h) => h.hostname.toLowerCase() === hostname.toLowerCase()) ?? json.result[0];
}


function cfErrorMessage(res: CFResult<unknown>): string {
  if (!res.errors?.length) return "Unknown Cloudflare error";
  return res.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
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
    const { property_id, portfolio_id, domain } = parsed.data;
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    if (!CF_ZONE_ID || !CF_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Cloudflare credentials not configured on the server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read existing row so we know if a CF hostname is already registered.
    // CRITICAL: if the row no longer stores a domain (user just clicked Remove
    // while an auto-poll request was already in flight), we must NOT recreate
    // the Cloudflare hostname or write the domain back — otherwise the removed
    // domain silently reappears a few seconds later.
    let existingHostnameId: string | null = null;
    let storedDomain: string | null = null;
    let rowExists = false;
    if (portfolio_id) {
      const { data } = await supabase
        .from("property_portfolios")
        .select("cloudflare_custom_hostname_id, white_label_domain")
        .eq("id", portfolio_id)
        .maybeSingle();
      rowExists = !!data;
      existingHostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
      storedDomain = ((data as any)?.white_label_domain || "").toLowerCase() || null;
    } else if (property_id) {
      const { data } = await supabase
        .from("property_billing_configs")
        .select("cloudflare_custom_hostname_id, white_label_domain")
        .eq("property_id", property_id)
        .maybeSingle();
      rowExists = !!data;
      existingHostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
      storedDomain = ((data as any)?.white_label_domain || "").toLowerCase() || null;
    }

    // Guard: if the caller is verifying a domain that is no longer the one
    // stored (or the row has been cleared), do nothing. This prevents races
    // between Remove/Save and any concurrent polling.
    if (rowExists && (!storedDomain || storedDomain !== normalized)) {
      return new Response(
        JSON.stringify({
          status: storedDomain ? "pending" : "cleared",
          last_error: null,
          skipped: true,
          reason: storedDomain
            ? "Stored domain differs from requested — ignoring stale verify call."
            : "Domain was removed — ignoring stale verify call.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If the domain changed vs an existing CF hostname on this row, drop the stale one.
    if (existingHostnameId && storedDomain && storedDomain !== normalized) {
      await cfFetch(`/zones/${CF_ZONE_ID}/custom_hostnames/${existingHostnameId}`, { method: "DELETE" }).catch(() => null);
      existingHostnameId = null;
    }

    // 1) DNS check
    const cnames = await doh(normalized, "CNAME");
    const aRecords = await doh(normalized, "A");
    const cnameTargets = cnames.map((r) => r.data.replace(/\.$/, "").toLowerCase());
    const ips = aRecords.map((r) => r.data);
    const cnameMatch = cnameTargets.some((t) =>
      EXPECTED_CNAME_HOSTS.some((h) => t === h || t.endsWith(`.${h}`)),
    );
    const aMatch = ips.includes(EXPECTED_A_RECORD);
    const dnsOk = cnameMatch || aMatch;
    const dnsMissing = cnameTargets.length === 0 && ips.length === 0;

    let status: Status = "pending";
    let lastError: string | null = null;
    let hostnameId: string | null = existingHostnameId;
    let cfHostnameStatus: string | null = null;
    let cfSslStatus: string | null = null;
    let originRouteError: string | null = null;
    let redirectRouteError: string | null = null;
    let routingMode: "origin" | "redirect" | null = null;

    if (!dnsOk) {
      if (dnsMissing) {
        status = "pending";
        lastError = "No DNS records found yet — add the CNAME shown below and try again.";
      } else {
        status = "failed";
        lastError = `DNS points elsewhere (CNAME: ${cnameTargets.join(", ") || "none"}, A: ${ips.join(", ") || "none"}).`;
      }
    } else {
      const originRoute = await cfEnsureOriginRoute(normalized);
      originRouteError = originRoute.error;
      if (originRoute.ok) {
        routingMode = "origin";
      } else if (requiresRedirectFallback(originRouteError)) {
        const redirectRoute = await cfEnsureCanonicalRedirect(normalized);
        redirectRouteError = redirectRoute.error;
        if (redirectRoute.ok) routingMode = "redirect";
      }

      // 2) Register on Cloudflare if not already, otherwise poll.
      // Always try to adopt an existing hostname by name first — avoids
      // duplicate-create errors and self-heals stale IDs after manual edits.
      if (!hostnameId) {
        const existing = await cfFindHostnameByName(normalized);
        if (existing) {
          hostnameId = existing.id;
          console.log("[verify-whitelabel-domain] adopted existing Cloudflare hostname", {
            hostname: normalized,
            hostname_id: hostnameId,
          });
        }
      }

      if (!hostnameId) {
        const created = await cfCreateHostname(normalized);
        if (!created.success || !created.result) {
          status = "failed";
          lastError = cfErrorMessage(created);
        } else {
          hostnameId = created.result.id;
          cfHostnameStatus = created.result.status;
          cfSslStatus = created.result.ssl?.status ?? null;
          status = "pending_ssl";
          lastError = originRouteError
            ? `DNS verified, certificate is issuing, but origin routing needs attention: ${originRouteError}`
            : "DNS verified. Cloudflare is issuing your certificate — this usually takes 1-2 minutes.";
        }
      }

      if (hostnameId && status !== "failed") {
        const got = await cfGetHostname(hostnameId);
        if (!got.success || !got.result) {
          // Stale ID — try to adopt by name and re-fetch.
          const msg = cfErrorMessage(got);
          if (msg.includes("1436") || msg.includes("not found")) {
            const existing = await cfFindHostnameByName(normalized);
            if (existing) {
              hostnameId = existing.id;
              cfHostnameStatus = existing.status;
              cfSslStatus = existing.ssl?.status ?? null;
              console.log("[verify-whitelabel-domain] re-adopted after stale ID", {
                hostname: normalized,
                hostname_id: hostnameId,
                hostname_status: cfHostnameStatus,
                ssl_status: cfSslStatus,
              });
              if (cfHostnameStatus === "active" && cfSslStatus === "active") {
                status = "active";
                lastError = originRouteError;
              } else {
                status = "pending_ssl";
                lastError = `Cloudflare: hostname=${cfHostnameStatus}, ssl=${cfSslStatus}.`;
              }
            } else {
              const created = await cfCreateHostname(normalized);
              if (!created.success || !created.result) {
                status = "failed";
                lastError = cfErrorMessage(created);
                hostnameId = null;
              } else {
                hostnameId = created.result.id;
                cfHostnameStatus = created.result.status;
                cfSslStatus = created.result.ssl?.status ?? null;
                status = "pending_ssl";
                lastError = "DNS verified. Cloudflare is issuing your certificate — this usually takes 1-2 minutes.";
              }
            }
          } else {
            status = "pending_ssl";
            lastError = `Cloudflare check failed: ${msg}`;
          }
        } else {

          cfHostnameStatus = got.result.status;
          cfSslStatus = got.result.ssl?.status ?? null;
          console.log("[verify-whitelabel-domain] Cloudflare hostname raw response", {
            hostname: normalized,
            hostname_id: hostnameId,
            hostname_status: cfHostnameStatus,
            ssl_status: cfSslStatus,
            ssl_validation_errors: got.result.ssl?.validation_errors ?? null,
            verification_errors: got.result.verification_errors ?? null,
            origin_route_error: originRouteError,
          });
          if (got.result.status === "active" && cfSslStatus === "active") {
            // Cert is live. The hostname is only usable if we can either route
            // Cloudflare to the shared fallback origin or redirect it to the
            // canonical app host. Without one of these, Vercel returns
            // DEPLOYMENT_NOT_FOUND for the customer hostname.
            if (routingMode) {
              status = "active";
              lastError = null;
            } else {
              status = "failed";
              lastError = redirectRouteError || originRouteError || "Domain certificate is active, but routing to the booking app could not be configured.";
            }
          } else {
            status = "pending_ssl";
            const sslErr = got.result.ssl?.validation_errors?.map((e) => e.message).join("; ") || "";
            const verErr = got.result.verification_errors?.join("; ") || "";
            const detail = [sslErr, verErr].filter(Boolean).join(" | ");
            lastError = detail
              ? `Cloudflare: hostname=${cfHostnameStatus}, ssl=${cfSslStatus} — ${detail}`
              : redirectRouteError || (originRouteError && !routingMode)
                ? `Cloudflare is still working — hostname=${cfHostnameStatus}, ssl=${cfSslStatus}. Routing: ${redirectRouteError || originRouteError}`
                : `Cloudflare is still working — hostname=${cfHostnameStatus}, ssl=${cfSslStatus}.`;
          }
        }

      }
    }

    const patch = {
      white_label_domain: normalized,
      white_label_domain_status: status,
      white_label_domain_verified_at: status === "active" ? new Date().toISOString() : null,
      white_label_domain_last_error: lastError,
      cloudflare_custom_hostname_id: hostnameId,
      custom_domain_error: lastError,
    } as any;

    if (portfolio_id) {
      await supabase.from("property_portfolios").update(patch).eq("id", portfolio_id);
    } else if (property_id) {
      await supabase.from("property_billing_configs").update(patch).eq("property_id", property_id);
    }

    return new Response(
      JSON.stringify({
        domain: normalized,
        status,
        last_error: lastError,
        cname_targets: cnameTargets,
        a_records: ips,
        dns_ok: dnsOk,
        cloudflare: {
          hostname_id: hostnameId,
          hostname_status: cfHostnameStatus,
          ssl_status: cfSslStatus,
          routing_mode: routingMode,
          origin_route_error: originRouteError,
          redirect_route_error: redirectRouteError,
        },
        expected: { cname: EXPECTED_CNAME_HOSTS, a: EXPECTED_A_RECORD },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("verify-whitelabel-domain error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
