// Delete a white-label domain: unregisters it from Cloudflare (if a custom
// hostname is registered) and clears the DB row back to `unconfigured`.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const CF_ZONE_ID = Deno.env.get("CLOUDFLARE_ZONE_ID") || "";
const CF_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

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
    if (portfolio_id) {
      const { data } = await supabase
        .from("property_portfolios")
        .select("cloudflare_custom_hostname_id")
        .eq("id", portfolio_id)
        .maybeSingle();
      hostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
    } else if (property_id) {
      const { data } = await supabase
        .from("property_billing_configs")
        .select("cloudflare_custom_hostname_id")
        .eq("property_id", property_id)
        .maybeSingle();
      hostnameId = (data as any)?.cloudflare_custom_hostname_id ?? null;
    }

    if (hostnameId && CF_ZONE_ID && CF_API_TOKEN) {
      await cfDelete(hostnameId);
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
