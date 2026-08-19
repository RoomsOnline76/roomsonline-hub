// ============================================================================
// CRON HUBSPOT SYNC — owner-level CRM delta sweep (free add-on)
//
// Walks every owner who has the HubSpot add-on enabled and asks the isolated
// `hubspot-api` function to push everything that changed since that owner's
// last successful sync. This is how channel bookings, web bookings and later
// status changes (confirm / check-in / cancel) reach the CRM without a single
// line of PMS, calendar or booking code being touched.
//
// It never reads or handles HubSpot tokens itself.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SERVICE = "hubspot";
/** How far back to look when an owner has never synced. */
const COLD_START_HOURS = 72;
/** Safety overlap so a record saved mid-sweep is not skipped. */
const OVERLAP_MINUTES = 10;

interface OwnerRow {
  owner_id: string;
  enabled: boolean;
  last_sync_at: string | null;
  access_token: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  try {
    let ownerScope: string[] = [];
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const raw = (body as { owner_ids?: unknown }).owner_ids;
      if (Array.isArray(raw)) ownerScope = raw.filter((v): v is string => typeof v === "string");
    }

    const query = admin
      .from("owner_integrations")
      .select("owner_id, enabled, last_sync_at, access_token")
      .eq("service", SERVICE)
      .eq("enabled", true);
    if (ownerScope.length) query.in("owner_id", ownerScope);

    const { data, error } = await query;
    if (error) throw new Error(`Could not list integrations: ${error.message}`);

    const owners = ((data || []) as OwnerRow[]).filter((o) => Boolean(o.access_token));

    const results: Array<Record<string, unknown>> = [];

    for (const owner of owners) {
      const since = owner.last_sync_at
        ? new Date(new Date(owner.last_sync_at).getTime() - OVERLAP_MINUTES * 60_000).toISOString()
        : new Date(Date.now() - COLD_START_HOURS * 3_600_000).toISOString();

      try {
        const res = await fetch(`${url}/functions/v1/hubspot-api`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "sync_owner",
            owner_id: owner.owner_id,
            since,
            limit: 100,
          }),
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          console.error(
            `[cron-hubspot-sync] owner ${owner.owner_id} failed [${res.status}]:`,
            JSON.stringify(payload)?.slice(0, 400),
          );
        }

        results.push({
          owner_id: owner.owner_id,
          since,
          status: res.status,
          ok: res.ok,
          ...(payload?.data ?? {}),
          ...(res.ok ? {} : { error: payload?.error ?? `HTTP ${res.status}` }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[cron-hubspot-sync] owner ${owner.owner_id} threw:`, message);
        results.push({ owner_id: owner.owner_id, since, ok: false, error: message });
      }
    }

    const failed = results.filter((r) => !r.ok).length;
    return new Response(
      JSON.stringify({
        success: true,
        owners: owners.length,
        synced: results.length - failed,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[cron-hubspot-sync] Error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
