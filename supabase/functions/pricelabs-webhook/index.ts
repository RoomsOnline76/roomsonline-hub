// ============================================================================
// PriceLabs webhook receiver — handles sync, calendar-trigger, hook callbacks
// Single function, routed by URL suffix. Returns 200 quickly so PriceLabs
// validation passes; payload is logged for async processing.
// ============================================================================
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function classifyPath(url: string): "sync" | "calendar_trigger" | "hook" | "unknown" {
  const p = url.toLowerCase();
  if (p.includes("calendar")) return "calendar_trigger";
  if (p.includes("sync")) return "sync";
  if (p.includes("hook")) return "hook";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const kind = classifyPath(new URL(req.url).pathname);
  let body: unknown = null;
  try { body = await req.json(); } catch { /* may be empty (PL validation ping) */ }

  console.log(`[pricelabs-webhook] kind=${kind}`, JSON.stringify(body)?.slice(0, 500));

  // Best-effort log to integration_logs (non-blocking)
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from("integration_logs").insert({
        system: "pricelabs",
        event_type: `webhook_${kind}`,
        payload: body ?? {},
        status: "received",
      });
    } catch (e) {
      console.warn("[pricelabs-webhook] log insert failed:", (e as Error).message);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, kind, received_at: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
