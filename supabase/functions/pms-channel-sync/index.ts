import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, connection_id } = body;

    switch (action) {
      case "push_inventory": {
        return await handlePushInventory(supabase, connection_id, corsHeaders);
      }
      case "pull_reservations": {
        return await handlePullReservations(supabase, connection_id, corsHeaders);
      }
      case "get_sync_status": {
        return await handleGetSyncStatus(supabase, connection_id, corsHeaders);
      }
      case "manual_sync": {
        return await handleManualSync(supabase, connection_id, corsHeaders);
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("pms-channel-sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getConnection(supabase: any, connectionId: string) {
  const { data, error } = await supabase
    .from("rolos_channel_connections")
    .select("*")
    .eq("id", connectionId)
    .single();
  if (error) throw new Error(`Connection not found: ${error.message}`);
  return data;
}

async function logSync(
  supabase: any,
  connectionId: string,
  syncType: string,
  status: string,
  recordsProcessed: number,
  errors: any,
  startedAt: Date
) {
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  await supabase.from("rolos_channel_sync_log").insert({
    connection_id: connectionId,
    sync_type: syncType,
    status,
    records_processed: recordsProcessed,
    errors,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
  });
}

async function handlePushInventory(supabase: any, connectionId: string, headers: any) {
  const startedAt = new Date();
  try {
    const connection = await getConnection(supabase, connectionId);

    // Fetch inventory calendar for the property
    const { data: inventory, error: invError } = await supabase
      .from("rolos_inventory_calendar")
      .select("*")
      .eq("property_id", connection.property_id)
      .gte("calendar_date", new Date().toISOString().split("T")[0])
      .order("calendar_date", { ascending: true })
      .limit(365);

    if (invError) throw invError;

    // Fetch room mappings for this connection
    const { data: mappings } = await supabase
      .from("rolos_channel_room_mapping")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("is_active", true);

    // STUB: Build payload but don't actually push to OTA
    const payload = {
      channel: connection.channel_name,
      property_id: connection.property_id,
      inventory_records: inventory?.length ?? 0,
      mapped_rooms: mappings?.length ?? 0,
      note: "STUB — actual OTA API push not yet implemented. Payload built successfully.",
    };

    console.log("[pms-channel-sync] push_inventory payload:", JSON.stringify(payload));

    // Update last_sync_at
    await supabase
      .from("rolos_channel_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", connectionId);

    await logSync(supabase, connectionId, "push_inventory", "success", inventory?.length ?? 0, null, startedAt);

    return new Response(JSON.stringify({ success: true, ...payload }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    await logSync(supabase, connectionId, "push_inventory", "failed", 0, { message: err.message }, startedAt);
    throw err;
  }
}

async function handlePullReservations(supabase: any, connectionId: string, headers: any) {
  const startedAt = new Date();
  try {
    const connection = await getConnection(supabase, connectionId);

    // STUB: In production, this would call the OTA API to fetch new reservations
    const stubReservations: any[] = [];

    console.log(
      `[pms-channel-sync] pull_reservations STUB for ${connection.channel_name}. ` +
        `Would fetch from OTA API and process ${stubReservations.length} reservations.`
    );

    await logSync(supabase, connectionId, "pull_reservations", "success", 0, null, startedAt);

    return new Response(
      JSON.stringify({
        success: true,
        channel: connection.channel_name,
        reservations_pulled: 0,
        note: "STUB — actual OTA API pull not yet implemented.",
      }),
      { headers: { ...headers, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await logSync(supabase, connectionId, "pull_reservations", "failed", 0, { message: err.message }, startedAt);
    throw err;
  }
}

async function handleGetSyncStatus(supabase: any, connectionId: string, headers: any) {
  const { data, error } = await supabase
    .from("rolos_channel_sync_log")
    .select("*")
    .eq("connection_id", connectionId)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return new Response(JSON.stringify({ logs: data }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function handleManualSync(supabase: any, connectionId: string, headers: any) {
  // Run both push and pull sequentially
  const pushRes = await handlePushInventory(supabase, connectionId, headers);
  const pushData = await pushRes.json();

  const pullRes = await handlePullReservations(supabase, connectionId, headers);
  const pullData = await pullRes.json();

  return new Response(
    JSON.stringify({
      success: true,
      push: pushData,
      pull: pullData,
    }),
    { headers: { ...headers, "Content-Type": "application/json" } }
  );
}
