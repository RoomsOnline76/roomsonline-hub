// Public host → booking surface resolver for white-label guest domains.
// Returns only host → slug mapping (no PII), so it is safe for anonymous use.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let host = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      host = String((body as any)?.host ?? "");
    } else {
      host = new URL(req.url).searchParams.get("host") ?? "";
    }
    host = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) {
      return json({ error: "Invalid host" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Portfolio-level white-label domain
    const { data: pfCfg } = await supabase
      .from("portfolio_billing_configs")
      .select("portfolio_id, white_label_domain, white_label_domain_status")
      .eq("white_label_domain", host)
      .eq("white_label_domain_status", "active")
      .limit(1);

    if (pfCfg && pfCfg.length > 0) {
      const { data: pf } = await supabase
        .from("property_portfolios")
        .select("slug")
        .eq("id", (pfCfg[0] as any).portfolio_id)
        .maybeSingle();
      if ((pf as any)?.slug) return json({ kind: "portfolio", slug: (pf as any).slug });
    }

    // 2) Property-level white-label domain(s)
    const { data: propCfgs } = await supabase
      .from("property_billing_configs")
      .select("property_id, white_label_domain, white_label_domain_status")
      .eq("white_label_domain", host)
      .eq("white_label_domain_status", "active");

    const propertyIds = (propCfgs ?? []).map((r: any) => r.property_id).filter(Boolean);
    if (propertyIds.length === 0) return json({ kind: null });

    // Multiple properties on one host → prefer their shared portfolio
    const { data: members } = await supabase
      .from("property_portfolio_members")
      .select("portfolio_id, property_id")
      .in("property_id", propertyIds);

    const portfolioIds = Array.from(
      new Set((members ?? []).map((m: any) => m.portfolio_id).filter(Boolean)),
    );

    if (portfolioIds.length === 1) {
      const { data: pf } = await supabase
        .from("property_portfolios")
        .select("slug")
        .eq("id", portfolioIds[0])
        .maybeSingle();
      if ((pf as any)?.slug) return json({ kind: "portfolio", slug: (pf as any).slug });
    }

    const { data: prop } = await supabase
      .from("properties")
      .select("slug")
      .eq("id", propertyIds[0])
      .maybeSingle();
    if ((prop as any)?.slug) return json({ kind: "property", slug: (prop as any).slug });

    return json({ kind: null });
  } catch (e) {
    console.error("resolve-whitelabel-host failed:", e);
    return json({ error: "Resolution failed" }, 500);
  }
});
