// ============================================================================
// PMS CHANNEL SYNC v2.0 — Adapter Pattern Architecture
// Each OTA channel gets a handler adapter. Core logic handles routing,
// logging, conflict detection. Actual API calls are adapter-specific.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createRateResolver,
  compressToPeriods,
  describeCoverage,
  addDays,
  eachDate,
  type DayRate,
} from "../_shared/rateResolution.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================================
// Channel Adapter Interface
// ============================================================================
interface ChannelAdapter {
  name: string;
  pushInventory(connection: any, inventory: any[], mappings: any[]): Promise<AdapterResult>;
  pullReservations(connection: any): Promise<PulledReservation[]>;
  pushRates(connection: any, ratePlans: any[], mappings: any[]): Promise<AdapterResult>;
}

interface AdapterResult {
  success: boolean;
  recordsProcessed: number;
  details: string;
  rawResponse?: unknown;
}

interface PulledReservation {
  externalId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  roomTypeExternalId: string;
  totalPrice: number;
  currency: string;
  status: string;
  rawData: unknown;
}

// ============================================================================
// Booking.com Adapter (structured payload, XML API format)
// ============================================================================
const bookingComAdapter: ChannelAdapter = {
  name: "booking_com",

  async pushInventory(connection, inventory, mappings) {
    // Build OTA_HotelAvailNotifRQ-style payload
    const availStatusMessages = inventory.map(inv => {
      const mapping = mappings.find(m => m.room_type_id === inv.room_type_id);
      return {
        StatusApplicationControl: {
          Start: inv.calendar_date,
          End: inv.calendar_date,
          InvTypeCode: mapping?.external_room_id || inv.room_type_id,
          RatePlanCode: mapping?.external_rate_id || "DEFAULT",
        },
        LengthsOfStay: { MinLOS: inv.min_stay || 1, MaxLOS: inv.max_stay || 30 },
        BookingLimit: inv.available_rooms ?? 0,
        RestrictionStatus: {
          Status: inv.is_closed ? "Close" : "Open",
          Restriction: inv.stop_sell ? "Master" : null,
        },
      };
    });

    const payload = {
      OTA_HotelAvailNotifRQ: {
        AvailStatusMessages: { AvailStatusMessage: availStatusMessages },
        HotelCode: connection.settings?.hotel_code || connection.property_id,
      },
    };

    console.log(`[channel-sync] booking_com push_inventory: ${availStatusMessages.length} records`);
    // STUB: Would POST to https://supply-xml.booking.com/hotels/xml/availability
    // const res = await fetch(endpoint, { method: "POST", body: buildXML(payload), headers: {...} });

    return {
      success: true,
      recordsProcessed: availStatusMessages.length,
      details: `ADAPTER_READY — ${availStatusMessages.length} availability records built for Booking.com XML API. Live push pending API credentials.`,
    };
  },

  async pullReservations(connection) {
    // STUB: Would call OTA_ReadRQ to fetch new/modified reservations
    // const res = await fetch('https://supply-xml.booking.com/hotels/xml/reservations', {...});
    console.log(`[channel-sync] booking_com pull_reservations for hotel ${connection.settings?.hotel_code || "unknown"}`);
    return [];
  },

  async pushRates(connection, ratePlans, mappings) {
    const rateAmountMessages = ratePlans.map(plan => {
      const mapping = mappings.find(m => m.rate_plan_id === plan.id);
      return {
        StatusApplicationControl: {
          RatePlanCode: mapping?.external_rate_id || plan.code || plan.id,
          InvTypeCode: mapping?.external_room_id || "DEFAULT",
        },
        Rates: {
          Rate: {
            Base: { AmountAfterTax: plan.base_rate, CurrencyCode: "ZAR" },
          },
        },
      };
    });

    console.log(`[channel-sync] booking_com push_rates: ${rateAmountMessages.length} rate plans`);
    return {
      success: true,
      recordsProcessed: rateAmountMessages.length,
      details: `ADAPTER_READY — ${rateAmountMessages.length} rate plans built for Booking.com. Live push pending API credentials.`,
    };
  },
};

// ============================================================================
// Airbnb Adapter (JSON API format)
// ============================================================================
const airbnbAdapter: ChannelAdapter = {
  name: "airbnb",

  async pushInventory(connection, inventory, mappings) {
    const calendarOps = inventory.map(inv => {
      const mapping = mappings.find(m => m.room_type_id === inv.room_type_id);
      return {
        listing_id: mapping?.external_room_id || inv.room_type_id,
        dates: [{
          start_date: inv.calendar_date,
          end_date: inv.calendar_date,
          available: !inv.is_closed && !inv.stop_sell,
          available_count: inv.available_rooms ?? 0,
          min_nights: inv.min_stay || 1,
          max_nights: inv.max_stay || 30,
        }],
      };
    });

    console.log(`[channel-sync] airbnb push_inventory: ${calendarOps.length} records`);
    // STUB: Would POST to https://api.airbnb.com/v2/calendars/batch
    return {
      success: true,
      recordsProcessed: calendarOps.length,
      details: `ADAPTER_READY — ${calendarOps.length} calendar updates built for Airbnb JSON API. Live push pending OAuth.`,
    };
  },

  async pullReservations(connection) {
    // STUB: Would GET https://api.airbnb.com/v2/reservations?listing_id=X&_offset=0
    console.log(`[channel-sync] airbnb pull_reservations for listing ${connection.settings?.listing_id || "unknown"}`);
    return [];
  },

  async pushRates(connection, ratePlans, mappings) {
    const priceUpdates = ratePlans.map(plan => {
      const mapping = mappings.find(m => m.rate_plan_id === plan.id);
      return {
        listing_id: mapping?.external_room_id || "DEFAULT",
        daily_price: plan.base_rate,
        currency: "ZAR",
      };
    });

    console.log(`[channel-sync] airbnb push_rates: ${priceUpdates.length} price updates`);
    return {
      success: true,
      recordsProcessed: priceUpdates.length,
      details: `ADAPTER_READY — ${priceUpdates.length} pricing updates built for Airbnb. Live push pending OAuth.`,
    };
  },
};

// ============================================================================
// Generic/Manual Adapter (for custom channels)
// ============================================================================
const genericAdapter: ChannelAdapter = {
  name: "generic",
  async pushInventory(_conn, inventory) {
    return { success: true, recordsProcessed: inventory.length, details: `Generic adapter: ${inventory.length} records logged (no OTA API).` };
  },
  async pullReservations() { return []; },
  async pushRates(_conn, rates) {
    return { success: true, recordsProcessed: rates.length, details: `Generic adapter: ${rates.length} rate plans logged (no OTA API).` };
  },
};

// ============================================================================
// Adapter Registry
// ============================================================================
function getAdapter(channelName: string): ChannelAdapter {
  const normalized = channelName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (normalized.includes("booking") && normalized.includes("com")) return bookingComAdapter;
  if (normalized.includes("airbnb")) return airbnbAdapter;
  return genericAdapter;
}

// ============================================================================
// Main Handler
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, connection_id } = body;

    switch (action) {
      case "push_inventory":
        return await handlePushInventory(supabase, connection_id, corsHeaders);
      case "pull_reservations":
        return await handlePullReservations(supabase, connection_id, corsHeaders);
      case "push_rates":
        return await handlePushRates(supabase, connection_id, corsHeaders);
      case "get_sync_status":
        return await handleGetSyncStatus(supabase, connection_id, corsHeaders);
      case "manual_sync":
        return await handleManualSync(supabase, connection_id, corsHeaders);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("pms-channel-sync error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================================
// Helpers
// ============================================================================
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
  supabase: any, connectionId: string, syncType: string,
  status: string, recordsProcessed: number, errors: any, startedAt: Date
) {
  const completedAt = new Date();
  await supabase.from("rolos_channel_sync_log").insert({
    connection_id: connectionId,
    sync_type: syncType,
    status,
    records_processed: recordsProcessed,
    errors,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
  });
}

// ============================================================================
// Conflict Detection
// ============================================================================
async function detectConflicts(
  supabase: any, propertyId: string, reservations: PulledReservation[]
): Promise<Array<{ reservation: PulledReservation; conflictWith: string; type: string }>> {
  const conflicts: Array<{ reservation: PulledReservation; conflictWith: string; type: string }> = [];

  for (const res of reservations) {
    // Check for date overlaps with existing bookings
    const { data: overlapping } = await supabase
      .from("bookings")
      .select("id, guest_name, check_in_date, check_out_date")
      .eq("property_id", propertyId)
      .lt("check_in_date", res.checkOut)
      .gt("check_out_date", res.checkIn)
      .in("status", ["confirmed", "checked_in"])
      .neq("external_reservation_id", res.externalId);

    if (overlapping?.length) {
      for (const existing of overlapping) {
        conflicts.push({
          reservation: res,
          conflictWith: `Booking ${existing.id} (${existing.guest_name}: ${existing.check_in_date} → ${existing.check_out_date})`,
          type: "date_overlap",
        });
      }
    }
  }
  return conflicts;
}

// ============================================================================
// Action Handlers
// ============================================================================
async function handlePushInventory(supabase: any, connectionId: string, headers: any) {
  const startedAt = new Date();
  try {
    const connection = await getConnection(supabase, connectionId);
    const adapter = getAdapter(connection.channel_name);

    const { data: inventory } = await supabase
      .from("rolos_inventory_calendar")
      .select("*")
      .eq("property_id", connection.property_id)
      .gte("calendar_date", new Date().toISOString().split("T")[0])
      .order("calendar_date", { ascending: true })
      .limit(365);

    const { data: mappings } = await supabase
      .from("rolos_channel_room_mapping")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("is_active", true);

    const result = await adapter.pushInventory(connection, inventory || [], mappings || []);

    await supabase
      .from("rolos_channel_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", connectionId);

    await logSync(supabase, connectionId, "push_inventory", result.success ? "success" : "failed", result.recordsProcessed, null, startedAt);

    return new Response(JSON.stringify({ success: true, adapter: adapter.name, ...result }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    await logSync(supabase, connectionId, "push_inventory", "failed", 0, { message: (err as Error).message }, startedAt);
    throw err;
  }
}

async function handlePullReservations(supabase: any, connectionId: string, headers: any) {
  const startedAt = new Date();
  try {
    const connection = await getConnection(supabase, connectionId);
    const adapter = getAdapter(connection.channel_name);

    const reservations = await adapter.pullReservations(connection);

    // Run conflict detection
    const conflicts = reservations.length > 0
      ? await detectConflicts(supabase, connection.property_id, reservations)
      : [];

    // Process non-conflicting reservations
    let imported = 0;
    for (const res of reservations) {
      const hasConflict = conflicts.some(c => c.reservation.externalId === res.externalId);

      if (!hasConflict) {
        // Check if already exists
        const { data: existing } = await supabase
          .from("bookings")
          .select("id")
          .eq("external_reservation_id", res.externalId)
          .eq("property_id", connection.property_id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("bookings").insert({
            property_id: connection.property_id,
            external_reservation_id: res.externalId,
            guest_name: res.guestName,
            guest_email: res.guestEmail,
            check_in_date: res.checkIn,
            check_out_date: res.checkOut,
            total_price: res.totalPrice,
            status: res.status === "confirmed" ? "confirmed" : "pending",
            booking_channel: connection.channel_name,
            integration_type: "channel_manager",
          });
          imported++;
        }
      }
    }

    await logSync(supabase, connectionId, "pull_reservations", "success", imported, conflicts.length > 0 ? { conflicts } : null, startedAt);

    return new Response(JSON.stringify({
      success: true,
      adapter: adapter.name,
      channel: connection.channel_name,
      reservations_pulled: reservations.length,
      imported,
      conflicts_detected: conflicts.length,
      conflicts: conflicts.slice(0, 10),
    }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    await logSync(supabase, connectionId, "pull_reservations", "failed", 0, { message: (err as Error).message }, startedAt);
    throw err;
  }
}

async function handlePushRates(supabase: any, connectionId: string, headers: any) {
  const startedAt = new Date();
  try {
    const connection = await getConnection(supabase, connectionId);
    const adapter = getAdapter(connection.channel_name);

    const { data: ratePlans } = await supabase
      .from("rolos_rate_plans")
      .select("*")
      .eq("property_id", connection.property_id)
      .eq("is_active", true);

    const { data: mappings } = await supabase
      .from("rolos_channel_rate_mapping")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("is_active", true);

    // Calendar-first pricing: resolve the real nightly price for the next 365 days
    // (calendar season → rack rate → unit daily rate) instead of pushing a flat base rate.
    const from = new Date().toISOString().slice(0, 10);
    const to = addDays(from, 365);
    const enriched: any[] = [];
    let coverageSummary = "no rate resolution";
    try {
      const resolver = await createRateResolver(supabase, connection.property_id, { window: { from, to } });
      const { data: planRooms } = await supabase
        .from("rolos_rate_plan_room_types")
        .select("rate_plan_id, room_type_id");

      let calendarDays = 0, rackDays = 0, pricedDays = 0, expected = 0;
      for (const plan of (ratePlans ?? [])) {
        const roomIds = new Set(
          (planRooms ?? [])
            .filter((pr: any) => pr.rate_plan_id === plan.id)
            .map((pr: any) => String(pr.room_type_id)),
        );
        const units = resolver.units.filter(
          (u) => u.linked_rolos_id && roomIds.has(String(u.linked_rolos_id)),
        );
        const targets = units.length > 0 ? units : resolver.units;
        // One period set per plan: cheapest priced unit per night (channels advertise "from").
        const perDate = new Map<string, DayRate>();
        for (const u of targets) {
          for (const d of resolver.resolveDays(u, from, to)) {
            const existing = perDate.get(d.date);
            if (!existing || d.price < existing.price) perDate.set(d.date, d);
          }
        }
        const days = [...perDate.values()];
        const cov = resolver.coverage(days);
        calendarDays += cov.calendar_days;
        rackDays += cov.rack_days + cov.unit_daily_days;
        pricedDays += cov.priced_days;
        expected += eachDate(from, to).length;

        const periods = compressToPeriods(days);
        enriched.push({
          ...plan,
          // Keep base_rate meaningful for adapters that only send a single amount.
          base_rate: periods[0]?.price ?? plan.base_rate,
          rate_periods: periods,
          rate_coverage: cov,
        });
      }
      coverageSummary = describeCoverage(expected, {
        total_days: pricedDays, priced_days: pricedDays, calendar_days: calendarDays,
        rack_days: rackDays, unit_daily_days: 0, unpriced_days: Math.max(0, expected - pricedDays),
      });
    } catch (resolveErr) {
      console.warn("[channel-sync] rate resolution failed, falling back to plan base rates:", resolveErr);
    }

    const plansToPush = enriched.length > 0 ? enriched : (ratePlans ?? []);
    const result = await adapter.pushRates(connection, plansToPush, mappings || []);
    result.details = `${result.details} Pricing: ${coverageSummary}.`;

    await logSync(supabase, connectionId, "push_rates", result.success ? "success" : "failed", result.recordsProcessed, null, startedAt);

    return new Response(JSON.stringify({ success: true, adapter: adapter.name, rate_coverage: coverageSummary, ...result }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    await logSync(supabase, connectionId, "push_rates", "failed", 0, { message: (err as Error).message }, startedAt);
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
  const pushRes = await handlePushInventory(supabase, connectionId, headers);
  const pushData = await pushRes.json();

  const rateRes = await handlePushRates(supabase, connectionId, headers);
  const rateData = await rateRes.json();

  const pullRes = await handlePullReservations(supabase, connectionId, headers);
  const pullData = await pullRes.json();

  return new Response(JSON.stringify({
    success: true,
    push_inventory: pushData,
    push_rates: rateData,
    pull_reservations: pullData,
  }), {
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
