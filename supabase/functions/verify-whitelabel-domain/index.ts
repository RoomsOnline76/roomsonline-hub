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
const CANONICAL_BOOKING_HOST = "sleepinafrica.roomsonline.co.za";
const WORKER_SCRIPT_NAME = Deno.env.get("CLOUDFLARE_WHITELABEL_WORKER") || "roomsonline-whitelabel-proxy";
const LEGACY_ORIGIN_RULESET_PHASE = "http_request_origin";
const LEGACY_ORIGIN_RULE_REF_PREFIX = "roomsonline_whitelabel_origin_";
const LEGACY_REDIRECT_RULESET_PHASE = "http_request_dynamic_redirect";
const LEGACY_REDIRECT_RULE_REF_PREFIX = "roomsonline_whitelabel_redirect_";

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

interface CFWorkerRoute {
  id: string;
  pattern: string;
  script: string | null;
}

interface CFZone {
  id: string;
  account?: { id?: string };
}

interface CFLegacyRulesetRule {
  ref?: string;
  expression: string;
}

interface CFLegacyRuleset {
  id: string;
  name: string;
  description?: string;
  kind: string;
  phase: string;
  rules: CFLegacyRulesetRule[];
}

function legacySafeRef(prefix: string, hostname: string): string {
  return `${prefix}${hostname.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`.slice(0, 128);
}

async function cfResolveAccountId(): Promise<string | null> {
  if (CF_ACCOUNT_ID) return CF_ACCOUNT_ID;
  const zoneResponse = await cfFetch(`/zones/${CF_ZONE_ID}`);
  const zone = (await zoneResponse.json()) as CFResult<CFZone>;
  return zone.success ? zone.result?.account?.id ?? null : null;
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
  const accountId = await cfResolveAccountId();
  if (!accountId) {
    return {
      ok: false,
      error: "Cloudflare account id could not be resolved from the configured zone. The API token must allow zone read and Workers script access.",
    };
  }

  const uploadedResponse = await cfFetch(`/accounts/${accountId}/workers/scripts/${WORKER_SCRIPT_NAME}`, {
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

async function cfDeleteLegacyRules(hostname: string): Promise<void> {
  try {
    const listResponse = await cfFetch(`/zones/${CF_ZONE_ID}/rulesets`);
    const listed = (await listResponse.json()) as CFResult<CFLegacyRuleset[]>;
    if (!listed.success || !listed.result) return;

    const refs = new Set([
      legacySafeRef(LEGACY_ORIGIN_RULE_REF_PREFIX, hostname),
      legacySafeRef(LEGACY_REDIRECT_RULE_REF_PREFIX, hostname),
    ]);
    const expressions = new Set([`http.host eq "${hostname}"`]);
    const phases = new Set([LEGACY_ORIGIN_RULESET_PHASE, LEGACY_REDIRECT_RULESET_PHASE]);

    for (const ruleset of listed.result) {
      if (ruleset.kind !== "zone" || !phases.has(ruleset.phase)) continue;
      const rules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
      const nextRules = rules.filter((rule) => !refs.has(rule.ref || "") && !expressions.has(rule.expression));
      if (nextRules.length === rules.length) continue;
      await cfFetch(`/zones/${CF_ZONE_ID}/rulesets/${ruleset.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: ruleset.name,
          description: ruleset.description,
          kind: ruleset.kind,
          phase: ruleset.phase,
          rules: nextRules,
        }),
      }).catch(() => null);
    }
  } catch (err) {
    console.warn("cfDeleteLegacyRules failed (ignored)", err);
  }
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
    let workerRouteError: string | null = null;
    let routingMode: "worker" | null = null;

    if (!dnsOk) {
      if (dnsMissing) {
        status = "pending";
        lastError = "No DNS records found yet — add the CNAME shown below and try again.";
      } else {
        status = "failed";
        lastError = `DNS points elsewhere (CNAME: ${cnameTargets.join(", ") || "none"}, A: ${ips.join(", ") || "none"}).`;
      }
    } else {
      await cfDeleteLegacyRules(normalized);
      const workerRoute = await cfEnsureWorkerRoute(normalized);
      workerRouteError = workerRoute.error;
      if (workerRoute.ok) routingMode = "worker";

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
          lastError = workerRouteError
            ? `DNS verified, certificate is issuing, but white-label proxy routing needs attention: ${workerRouteError}`
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
                lastError = workerRouteError;
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
            worker_route_error: workerRouteError,
          });
          if (got.result.status === "active" && cfSslStatus === "active") {
            // Cert is live. The hostname is usable only when the reusable
            // Worker proxy route exists; otherwise Vercel still sees the
            // customer hostname and returns DEPLOYMENT_NOT_FOUND.
            if (routingMode) {
              status = "active";
              lastError = null;
            } else {
              status = "failed";
              lastError = workerRouteError || "Domain certificate is active, but the white-label proxy route could not be configured.";
            }
          } else {
            status = "pending_ssl";
            const sslErr = got.result.ssl?.validation_errors?.map((e) => e.message).join("; ") || "";
            const verErr = got.result.verification_errors?.join("; ") || "";
            const detail = [sslErr, verErr].filter(Boolean).join(" | ");
            lastError = detail
              ? `Cloudflare: hostname=${cfHostnameStatus}, ssl=${cfSslStatus} — ${detail}`
              : workerRouteError && !routingMode
                ? `Cloudflare is still working — hostname=${cfHostnameStatus}, ssl=${cfSslStatus}. Routing: ${workerRouteError}`
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
          worker_route_error: workerRouteError,
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
