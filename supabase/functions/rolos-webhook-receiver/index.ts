import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSign(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ─── Action: Register a webhook subscription ───
    if (action === "subscribe") {
      const { property_id, url, secret, events } = body;
      if (!property_id || !url || !secret || !events?.length) {
        return new Response(
          JSON.stringify({ error: "property_id, url, secret, and events[] required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("rolos_webhook_subscriptions")
        .upsert(
          { property_id, url, secret, events, is_active: true, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, subscription: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: Unsubscribe ───
    if (action === "unsubscribe") {
      const { subscription_id } = body;
      const { error } = await supabase
        .from("rolos_webhook_subscriptions")
        .update({ is_active: false })
        .eq("id", subscription_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: Queue an event (called internally by triggers/cron) ───
    if (action === "queue_event") {
      const { property_id, event, payload } = body;

      // Find active subscriptions for this property+event
      const { data: subs } = await supabase
        .from("rolos_webhook_subscriptions")
        .select("*")
        .eq("property_id", property_id)
        .eq("is_active", true);

      const matchingSubs = (subs || []).filter((s: any) =>
        s.events.includes(event) || s.events.includes("*")
      );

      if (!matchingSubs.length) {
        return new Response(
          JSON.stringify({ success: true, queued: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const logs = matchingSubs.map((sub: any) => ({
        subscription_id: sub.id,
        property_id,
        event,
        payload,
        status: "pending",
        attempts: 0,
        max_attempts: 3,
      }));

      const { error } = await supabase.from("rolos_webhook_logs").insert(logs);
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, queued: logs.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: Process pending deliveries (called by cron) ───
    if (action === "process_pending") {
      const { data: pending } = await supabase
        .from("rolos_webhook_logs")
        .select("*, rolos_webhook_subscriptions!subscription_id(url, secret)")
        .eq("status", "pending")
        .lt("attempts", 3)
        .order("created_at", { ascending: true })
        .limit(50);

      let delivered = 0;
      let failed = 0;

      for (const log of pending || []) {
        const sub = (log as any).rolos_webhook_subscriptions;
        if (!sub?.url) {
          await supabase
            .from("rolos_webhook_logs")
            .update({ status: "failed", error_message: "No subscription URL" })
            .eq("id", log.id);
          failed++;
          continue;
        }

        const payloadStr = JSON.stringify({
          event: log.event,
          property_id: log.property_id,
          payload: log.payload,
          timestamp: new Date().toISOString(),
          delivery_id: log.id,
        });

        const signature = await hmacSign(sub.secret, payloadStr);

        try {
          const resp = await fetch(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-ROL-Signature": signature,
              "X-ROL-Event": log.event,
              "X-ROL-Delivery": log.id,
            },
            body: payloadStr,
            signal: AbortSignal.timeout(10000),
          });

          const respBody = await resp.text().catch(() => "");

          if (resp.ok) {
            await supabase
              .from("rolos_webhook_logs")
              .update({
                status: "delivered",
                response_status: resp.status,
                response_body: respBody.slice(0, 500),
                attempts: log.attempts + 1,
                delivered_at: new Date().toISOString(),
              })
              .eq("id", log.id);
            delivered++;
          } else {
            const newAttempts = log.attempts + 1;
            await supabase
              .from("rolos_webhook_logs")
              .update({
                status: newAttempts >= log.max_attempts ? "failed" : "pending",
                response_status: resp.status,
                response_body: respBody.slice(0, 500),
                attempts: newAttempts,
                error_message: `HTTP ${resp.status}`,
              })
              .eq("id", log.id);
            failed++;
          }
        } catch (fetchErr) {
          const newAttempts = log.attempts + 1;
          await supabase
            .from("rolos_webhook_logs")
            .update({
              status: newAttempts >= log.max_attempts ? "failed" : "pending",
              attempts: newAttempts,
              error_message: fetchErr instanceof Error ? fetchErr.message : "Fetch failed",
            })
            .eq("id", log.id);
          failed++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, delivered, failed, processed: (pending || []).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: Send a test ping ───
    if (action === "test_ping") {
      const { subscription_id } = body;

      const { data: sub } = await supabase
        .from("rolos_webhook_subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .single();

      if (!sub) {
        return new Response(
          JSON.stringify({ error: "Subscription not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const testPayload = JSON.stringify({
        event: "test.ping",
        property_id: sub.property_id,
        payload: { message: "This is a test webhook from ROL'OS", timestamp: new Date().toISOString() },
        delivery_id: "test-" + crypto.randomUUID(),
      });

      const signature = await hmacSign(sub.secret, testPayload);

      try {
        const resp = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ROL-Signature": signature,
            "X-ROL-Event": "test.ping",
          },
          body: testPayload,
          signal: AbortSignal.timeout(10000),
        });

        return new Response(
          JSON.stringify({
            success: resp.ok,
            status: resp.status,
            message: resp.ok ? "Ping delivered successfully" : `Ping failed with HTTP ${resp.status}`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            message: err instanceof Error ? err.message : "Connection failed",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Action: Get delivery logs ───
    if (action === "get_logs") {
      const { property_id, limit: logLimit } = body;
      const { data: logs } = await supabase
        .from("rolos_webhook_logs")
        .select("*")
        .eq("property_id", property_id)
        .order("created_at", { ascending: false })
        .limit(logLimit || 50);

      return new Response(
        JSON.stringify({ success: true, logs: logs || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("rolos-webhook-receiver error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
