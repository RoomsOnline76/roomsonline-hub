import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================================================
// BEDS24 API v2 ADAPTER
// Docs: https://api.beds24.com/v2/
// Auth: long-life token in `token` header (BEDS24_API_TOKEN secret).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const B24_BASE = "https://beds24.com/api/v2";
const STANDARD_TIMEOUT_MS = 60_000;

function getAuthHeaders(token: string): Record<string, string> {
  return {
    token,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    accept: "application/json",
  };
}

async function b24Fetch(url: string, init: RequestInit = {}, timeoutMs = STANDARD_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "Accept-Encoding": "gzip, deflate",
      ...(init.headers || {}),
    } as Record<string, string>;
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Fuzzy match (mirrors hyperguest)
// ---------------------------------------------------------------------------
function normalizeName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenScore(query: string, target: string): number {
  const q = new Set(normalizeName(query).split(" ").filter(Boolean));
  const t = new Set(normalizeName(target).split(" ").filter(Boolean));
  if (!q.size || !t.size) return 0;
  let inter = 0;
  for (const tok of q) if (t.has(tok)) inter++;
  const union = q.size + t.size - inter;
  const jaccard = inter / union;
  const sub = normalizeName(target).includes(normalizeName(query)) ? 0.2 : 0;
  return jaccard + sub;
}

const AFRICA_ISO2 = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER",
  "SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","YT","MA",
  "MZ","NA","NE","NG","RE","RW","SH","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN",
  "UG","EH","ZM","ZW",
]);
const AFRICA_NAMES = new Set(Array.from(AFRICA_ISO2).concat([
  "algeria","angola","benin","botswana","burkina faso","burundi","cabo verde","cape verde","cameroon",
  "central african republic","chad","comoros","congo","democratic republic of the congo","drc",
  "ivory coast","cote d'ivoire","côte d'ivoire","djibouti","egypt","equatorial guinea","eritrea",
  "eswatini","swaziland","ethiopia","gabon","gambia","ghana","guinea","guinea-bissau","kenya",
  "lesotho","liberia","libya","madagascar","malawi","mali","mauritania","mauritius","mayotte",
  "morocco","mozambique","namibia","niger","nigeria","reunion","réunion","rwanda","saint helena",
  "sao tome and principe","são tomé and príncipe","senegal","seychelles","sierra leone","somalia",
  "south africa","south sudan","sudan","tanzania","togo","tunisia","uganda","western sahara",
  "zambia","zimbabwe",
].map((s) => s.toLowerCase())));

function isAfrican(country: string | null): boolean {
  if (!country) return false;
  const c = country.trim();
  if (c.length === 2 && AFRICA_ISO2.has(c.toUpperCase())) return true;
  return AFRICA_NAMES.has(c.toLowerCase());
}

function normalizeB24Property(raw: any): { id: string; name: string; city: string | null; country: string | null } | null {
  if (!raw) return null;
  const id = raw.id ?? raw.propertyId ?? raw.propId;
  if (id === undefined || id === null) return null;
  const name = raw.name ?? raw.propertyName ?? raw.title ?? "";
  const city = raw.city ?? raw.address?.city ?? null;
  const country = raw.country ?? raw.countryCode ?? raw.address?.country ?? null;
  return {
    id: String(id),
    name: String(name || ""),
    city: city ? String(city) : null,
    country: country ? String(country) : null,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function healthCheck(token: string) {
  const resp = await b24Fetch(`${B24_BASE}/authentication/details`, {
    headers: getAuthHeaders(token),
  });
  const ok = resp.ok;
  let body: any = null;
  try { body = await resp.json(); } catch { /* ignore */ }
  return { healthy: ok, status: resp.status, details: body };
}

async function listHotels(token: string, opts: { query?: string; limit?: number }) {
  const url = `${B24_BASE}/properties`;
  const resp = await b24Fetch(url, { headers: getAuthHeaders(token) });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
      return {
        source: "unavailable" as const,
        reason: `Beds24 /properties returned ${resp.status}. The configured token may not have permission to list properties — paste the Beds24 property ID manually.`,
        status: resp.status,
        hotels: [],
        total: 0,
      };
    }
    throw new Error(`Beds24 /properties failed: ${resp.status} ${text.substring(0, 200)}`);
  }

  let payload: any;
  try { payload = await resp.json(); } catch {
    return {
      source: "unavailable" as const,
      reason: "Beds24 /properties returned a non-JSON response.",
      hotels: [],
      total: 0,
    };
  }

  const raw = Array.isArray(payload) ? payload : (payload.data ?? payload.properties ?? []);
  const normalized = (raw as any[])
    .map(normalizeB24Property)
    .filter((h): h is { id: string; name: string; city: string | null; country: string | null } => !!h);

  const africaOnly = normalized.filter((h) => isAfrican(h.country));

  const query = (opts.query ?? "").trim();
  const limit = opts.limit ?? 25;

  let hotels: any[] = africaOnly;
  if (query) {
    hotels = africaOnly
      .map((h) => ({ ...h, score: tokenScore(query, h.name) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } else {
    hotels = africaOnly.slice(0, limit);
  }

  return {
    source: "static" as const,
    total: africaOnly.length,
    returned: hotels.length,
    query: query || null,
    region: "africa",
    hotels,
  };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const RequestSchema = z.object({
  action: z.enum(["health_check", "list_hotels"]),
  property_id: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("BEDS24_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: { code: "AUTH_FAILED", message: "BEDS24_API_TOKEN not configured" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ success: false, error: { code: "INVALID_REQUEST", message: parsed.error.message } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { action } = parsed.data;

    let data: any;
    switch (action) {
      case "health_check":
        data = await healthCheck(token);
        break;
      case "list_hotels":
        data = await listHotels(token, { query: parsed.data.query, limit: parsed.data.limit });
        break;
      default:
        return new Response(
          JSON.stringify({ success: false, error: { code: "INVALID_REQUEST", message: `Unknown action: ${action}` } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL_ADAPTER_ERROR", message: e?.message ?? String(e) } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
