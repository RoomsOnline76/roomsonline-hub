// Verifies a property's custom white-label subdomain by resolving DNS via
// Cloudflare's DNS-over-HTTPS API and checking that the CNAME (or the resolved
// A record) points at our hosting target. Updates
// `property_billing_configs.white_label_domain_status` accordingly.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const EXPECTED_CNAME_HOSTS = [
  "sleepinafrica.roomsonline.co.za",
  "roomsonline.co.za",
];
const EXPECTED_A_RECORD = "185.158.133.1";

const BodySchema = z.object({
  property_id: z.string().uuid(),
  domain: z.string().min(4).max(255).regex(/^[a-z0-9.-]+$/i),
});

interface DohRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohRecord[];
}

async function doh(name: string, type: "CNAME" | "A"): Promise<DohRecord[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const r = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!r.ok) return [];
  const json = (await r.json()) as DohResponse;
  return json.Answer || [];
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
    const { property_id, domain } = parsed.data;
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    // Resolve CNAME first; fall back to A record.
    const cnames = await doh(normalized, "CNAME");
    const aRecords = await doh(normalized, "A");
    const cnameTargets = cnames.map((r) => r.data.replace(/\.$/, "").toLowerCase());
    const ips = aRecords.map((r) => r.data);

    const cnameMatch = cnameTargets.some((t) =>
      EXPECTED_CNAME_HOSTS.some((h) => t === h || t.endsWith(`.${h}`)),
    );
    const aMatch = ips.includes(EXPECTED_A_RECORD);
    const verified = cnameMatch || aMatch;
    const status: "active" | "failed" | "pending" =
      verified ? "active" : ips.length === 0 && cnameTargets.length === 0 ? "pending" : "failed";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase
      .from("property_billing_configs")
      .update({
        white_label_domain: normalized,
        white_label_domain_status: status,
        white_label_domain_verified_at: verified ? new Date().toISOString() : null,
      } as any)
      .eq("property_id", property_id);

    return new Response(
      JSON.stringify({
        domain: normalized,
        status,
        cname_targets: cnameTargets,
        a_records: ips,
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
