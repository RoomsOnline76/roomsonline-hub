// HyperGuest Certification Portal — token-gated public wrapper around hyperguest-api
// Allows HyperGuest's QA team to (a) run the 12-step certification against sandbox hotel 19912
// and (b) inspect a read-only "reflection" of how cancellation policies, board bases, taxes,
// fees, remarks, special requests, photos, and facilities are presented in ROLOS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SANDBOX_HOTEL_ID = "19912";

// Constant-time string compare to avoid token timing leaks
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validateToken(supabase: any, token: string | null): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const { data } = await supabase
    .from("hyperguest_portal_config")
    .select("token, enabled")
    .eq("id", true)
    .maybeSingle();
  if (!data || !data.enabled) return false;
  return safeEqual(String(data.token), token);
}

// Sliding window rate limit: 10 runs / hour / token
async function checkRateLimit(supabase: any, tokenHash: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("hyperguest_cert_runs")
    .select("id", { count: "exact", head: true })
    .eq("token_hash", tokenHash)
    .gte("started_at", oneHourAgo);
  return (count ?? 0) < 10;
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Reflection: surface read-only data for the sandbox property
async function buildReflection(supabase: any) {
  // Resolve the ROLOS property linked to the sandbox hotel.
  let propertyId: string | null = null;
  let matchedVia: string | null = null;

  const { data: byHgCol } = await supabase
    .from("properties")
    .select("id")
    .eq("hyperguest_hotel_id", SANDBOX_HOTEL_ID)
    .limit(1)
    .maybeSingle();
  if (byHgCol?.id) { propertyId = byHgCol.id; matchedVia = "hyperguest_hotel_id"; }

  if (!propertyId) {
    const { data: byExt } = await supabase
      .from("properties")
      .select("id")
      .eq("external_system", "hyperguest")
      .eq("external_id", SANDBOX_HOTEL_ID)
      .limit(1)
      .maybeSingle();
    if (byExt?.id) { propertyId = byExt.id; matchedVia = "external_id+external_system"; }
  }

  const reflection: Record<string, unknown> = {
    sandbox_hotel_id: SANDBOX_HOTEL_ID,
    property_id: propertyId,
    matched_via: matchedVia,
    sections: {} as Record<string, unknown>,
  };

  if (!propertyId) {
    reflection.warning = "No ROLOS property is linked to sandbox hotel 19912. Set properties.hyperguest_hotel_id = '19912' (or external_system='hyperguest' + external_id='19912').";
    reflection.sections = {
      cancellation_policies: [],
      board_bases: [],
      taxes_fees: [],
      remarks: [],
      special_requests: { note: "No linked property — reflection unavailable." },
      photos: { property_images: [], room_images: [], min_resolution: "1024x683" },
      facilities: [],
    };
    return reflection;
  }

  // Auto-sync if reflection is missing or older than 24h.
  const { data: prop } = await supabase
    .from("properties")
    .select("name, amenities, images, description, external_metadata, hyperguest_last_static_sync_at")
    .eq("id", propertyId)
    .maybeSingle();

  const lastSync = prop?.hyperguest_last_static_sync_at
    ? new Date(prop.hyperguest_last_static_sync_at).getTime()
    : 0;
  const stale = !lastSync || (Date.now() - lastSync) > 24 * 60 * 60 * 1000;

  let syncError: string | null = null;
  if (stale) {
    const { error: syncErr } = await supabase.functions.invoke("hyperguest-api", {
      body: { action: "sync_reflection", property_id: propertyId },
    });
    if (syncErr) {
      syncError = syncErr.message;
    } else {
      const { data: refreshed } = await supabase
        .from("properties")
        .select("name, amenities, images, description, external_metadata, hyperguest_last_static_sync_at")
        .eq("id", propertyId)
        .maybeSingle();
      if (refreshed) Object.assign(prop ?? {}, refreshed);
    }
  }

  const hgRef = (prop?.external_metadata as any)?.hyperguest_reflection ?? null;

  const [{ data: charges }, { data: policies }, { data: roomTypes }, { data: rateTypes }] = await Promise.all([
    supabase
      .from("property_charges")
      .select("name, amount, category, calculation_method, currency, is_refundable")
      .eq("property_id", propertyId),
    supabase
      .from("rolos_policies")
      .select("policy_type, rule")
      .eq("property_id", propertyId),
    supabase
      .from("pms_room_types_cache")
      .select("external_room_type_id, name, description, max_guests, raw_data")
      .eq("property_id", propertyId)
      .eq("system_type", "hyperguest"),
    supabase
      .from("pms_rate_types_cache")
      .select("external_rate_type_id, name, description, raw_data")
      .eq("property_id", propertyId)
      .eq("system_type", "hyperguest"),
  ]);

  reflection.property_name = prop?.name ?? null;
  reflection.last_synced_at = prop?.hyperguest_last_static_sync_at ?? null;
  if (syncError) reflection.sync_error = syncError;

  const boardBases = hgRef?.board_bases ?? (rateTypes ?? []).map((r: any) => ({
    id: r.external_rate_type_id,
    name: r.name,
    board_code: r.raw_data?.board ?? null,
  }));

  const cancellationPolicies = hgRef?.cancellation_policies
    ?? (policies ?? []).filter((p: any) => p.policy_type === "cancellation").map((p: any) => p.rule);

  const remarks = hgRef?.remarks ?? [];

  const photos = {
    property_images: (hgRef?.photos?.length ? hgRef.photos : (prop?.images as any[] | null)) ?? [],
    room_images: (roomTypes ?? []).map((r: any) => ({
      room: r.name,
      images: r.raw_data?.images ?? r.raw_data?.photos ?? [],
    })),
    min_resolution: "1024x683",
  };

  const facilities = hgRef?.facilities ?? prop?.amenities ?? [];

  reflection.sections = {
    cancellation_policies: cancellationPolicies,
    board_bases: boardBases,
    taxes_fees: charges ?? [],
    remarks,
    special_requests: {
      note:
        "Guest special requests are captured at checkout and forwarded to HyperGuest as part of the booking payload. Sample formats are visible in the certification run logs (Test #2 onward) — see fields special_requests / remarks.",
    },
    photos,
    facilities,
    rooms_summary: (roomTypes ?? []).map((r: any) => ({
      id: r.external_room_type_id,
      name: r.name,
      max_guests: r.max_guests,
    })),
  };

  return reflection;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";
    const token: string | null = body.token ?? null;

    const ok = await validateToken(supabase, token);
    if (!ok) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_or_expired_token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token!);

    if (action === "validate") {
      return new Response(
        JSON.stringify({ success: true, sandbox_hotel_id: SANDBOX_HOTEL_ID }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list_runs") {
      const { data, error } = await supabase
        .from("hyperguest_cert_runs")
        .select("id, started_at, finished_at, status, steps")
        .eq("token_hash", tokenHash)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const summary = (data ?? []).map((r: any) => ({
        id: r.id,
        started_at: r.started_at,
        finished_at: r.finished_at,
        status: r.status,
        passed: (r.steps ?? []).filter((s: any) => s.status === "passed").length,
        total: (r.steps ?? []).length,
      }));
      return new Response(JSON.stringify({ success: true, runs: summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_run") {
      const { data, error } = await supabase
        .from("hyperguest_cert_runs")
        .select("*")
        .eq("token_hash", tokenHash)
        .eq("id", body.run_id)
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, run: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reflection") {
      const reflection = await buildReflection(supabase);
      return new Response(JSON.stringify({ success: true, reflection }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run_certification") {
      if (!(await checkRateLimit(supabase, tokenHash))) {
        return new Response(
          JSON.stringify({ success: false, error: "rate_limited", message: "Maximum 10 certification runs per hour. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert a "running" row first so the UI can poll status
      const { data: runRow, error: insertErr } = await supabase
        .from("hyperguest_cert_runs")
        .insert({
          token_hash: tokenHash,
          sandbox_hotel_id: SANDBOX_HOTEL_ID,
          status: "running",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // Invoke the existing hyperguest-api edge function (uses sandbox hotel by default)
      const { data: certData, error: certErr } = await supabase.functions.invoke("hyperguest-api", {
        body: { action: "run_certification" },
      });

      const payload = certErr
        ? { success: false, error: certErr.message }
        : certData;

      const steps = payload?.data?.steps ?? [];
      const fullLog = payload?.data?.full_log ?? null;
      const passedAll = steps.length > 0 && steps.every((s: any) => s.status === "passed");

      await supabase
        .from("hyperguest_cert_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: certErr ? "error" : passedAll ? "passed" : "failed",
          steps,
          full_log: fullLog,
        })
        .eq("id", runRow.id);

      return new Response(
        JSON.stringify({ success: true, run_id: runRow.id, result: payload }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "unknown_action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[hyperguest-cert-portal] error", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
