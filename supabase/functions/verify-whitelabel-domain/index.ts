// Verifies a property's or portfolio's custom white-label subdomain in two
// steps:
//   1) DNS: CNAME (or A record) points at our hosting target.
//   2) HTTPS reachability: TLS handshake completes and a health probe returns
//      a 2xx/3xx from the branded host.
//
// Since we no longer register white-label domains on our own hosting, the
// customer must terminate TLS themselves (Cloudflare orange-cloud proxy or
// their own CDN/reverse proxy). A domain is only marked `active` when both
// checks pass — DNS alone gets `dns_ok_tls_pending`, everything else keeps
// the previous `pending`/`failed` semantics.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const EXPECTED_CNAME_HOSTS = [
  "sleepinafrica.roomsonline.co.za",
  "roomsonline.co.za",
];
const EXPECTED_A_RECORD = "185.158.133.1";
const HTTPS_TIMEOUT_MS = 6000;

type Status = "active" | "failed" | "pending" | "dns_ok_tls_pending";

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

async function probeHttps(domain: string): Promise<{ ok: boolean; reason: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTPS_TIMEOUT_MS);
  try {
    const r = await fetch(`https://${domain}/`, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": "rolos-whitelabel-verifier/1.0" },
    });
    // Any real HTTP response (2xx/3xx/4xx) means TLS terminated successfully.
    // We only accept 2xx/3xx as "live"; 4xx/5xx suggest a proxy that isn't
    // forwarding correctly.
    if (r.status >= 200 && r.status < 400) return { ok: true, reason: null };
    return { ok: false, reason: `HTTPS returned ${r.status} — proxy is reachable but not forwarding to our canonical host.` };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return { ok: false, reason: "HTTPS request timed out — no TLS certificate is being served for this host. Enable Cloudflare proxy (orange cloud) or terminate SSL on your own CDN." };
    }
    if (/certificate|TLS|SSL|handshake/i.test(msg)) {
      return { ok: false, reason: `TLS handshake failed (${msg}). No cert is provisioned for this host. Enable Cloudflare proxy (orange cloud) or terminate SSL on your own CDN.` };
    }
    return { ok: false, reason: `HTTPS unreachable: ${msg}` };
  } finally {
    clearTimeout(t);
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
    const { property_id, portfolio_id, domain } = parsed.data;
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    // 1) DNS
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

    // 2) HTTPS probe (only meaningful when DNS at least resolves)
    let tls: { ok: boolean; reason: string | null } = { ok: false, reason: dnsMissing ? "No DNS records found yet." : "HTTPS not probed." };
    if (!dnsMissing) tls = await probeHttps(normalized);

    let status: Status;
    let lastError: string | null = null;
    if (dnsOk && tls.ok) {
      status = "active";
    } else if (dnsOk && !tls.ok) {
      status = "dns_ok_tls_pending";
      lastError = tls.reason;
    } else if (dnsMissing) {
      status = "pending";
      lastError = "No DNS records found yet — add the CNAME shown below and try again.";
    } else {
      status = "failed";
      lastError = `DNS points elsewhere (CNAME: ${cnameTargets.join(", ") || "none"}, A: ${ips.join(", ") || "none"}).`;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const patch = {
      white_label_domain: normalized,
      white_label_domain_status: status,
      white_label_domain_verified_at: status === "active" ? new Date().toISOString() : null,
      white_label_domain_last_error: lastError,
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
        tls_ok: tls.ok,
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
