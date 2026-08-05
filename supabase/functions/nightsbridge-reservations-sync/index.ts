import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NightsBridgeReservation {
  id: string;
  reference: string;
  property_id?: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  check_in: string;
  check_out: string;
  room_type?: string;
  rate_name?: string;
  adults: number;
  children?: number;
  total_amount: number;
  currency: string;
  status: string;
  created_at?: string;
  special_requests?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const nightsbridgeApiKey = Deno.env.get("NIGHTSBRIDGE_API_KEY");

    if (!nightsbridgeApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "NIGHTSBRIDGE_API_KEY not configured",
          message: "Please configure your NightsBridge API key in the secrets",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body for optional filtering
    let startDate: string | undefined;
    let endDate: string | undefined;
    let propertyId: string | undefined;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      startDate = body.start_date;
      endDate = body.end_date;
      propertyId = body.property_id;
    }

    // Get NightsBridge credentials (agent code)
    const { data: credentials } = await supabase
      .from("pms_credentials")
      .select("agent_code")
      .eq("system_type", "nightsbridge")
      .eq("is_active", true)
      .maybeSingle();

    const agentCode = credentials?.agent_code;

    if (!agentCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No active NightsBridge agent code configured",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build query params for NightsBridge API
    // Note: Actual NightsBridge API endpoints and params may vary - this is a template
    const params = new URLSearchParams();
    params.append("agent_code", agentCode);
    
    if (startDate) {
      params.append("from_date", startDate);
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      params.append("from_date", thirtyDaysAgo.toISOString().split("T")[0]);
    }
    
    if (endDate) {
      params.append("to_date", endDate);
    } else {
      // Default to 13 months (395 days) ahead
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 395);
      params.append("to_date", futureDate.toISOString().split("T")[0]);
    }

    // NightsBridge API call
    // Note: The actual NightsBridge API URL and structure may differ
    // This is a template based on common PMS API patterns
    const apiUrl = `https://api.nightsbridge.com/v1/reservations?${params.toString()}`;
    
    console.log("Fetching NightsBridge reservations from:", apiUrl);

    const nbResponse = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${nightsbridgeApiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    if (!nbResponse.ok) {
      const errorText = await nbResponse.text();
      console.error("NightsBridge API error:", nbResponse.status, errorText);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `NightsBridge API error: ${nbResponse.status}`,
          details: errorText,
          message: "Failed to fetch reservations from NightsBridge. The API may not be available yet (requires 50+ properties).",
        }),
        {
          status: nbResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const nbData = await nbResponse.json();
    const reservations: NightsBridgeReservation[] = nbData.reservations || nbData.data || [];

    console.log(`Received ${reservations.length} reservations from NightsBridge`);

    // Map and upsert reservations to pms_reservations table
    let syncedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const res of reservations) {
      try {
        // Map NightsBridge property to our property via external_id
        let mappedPropertyId: string | null = null;
        
        if (res.property_id) {
          const { data: property } = await supabase
            .from("properties")
            .select("id")
            .eq("external_id", res.property_id)
            .eq("external_system", "nightsbridge")
            .maybeSingle();
          
          mappedPropertyId = property?.id || null;
        }

        // If specific property requested, filter
        if (propertyId && mappedPropertyId !== propertyId) {
          continue;
        }

        const reservationData = {
          external_reservation_id: res.reference || res.id,
          system_type: "nightsbridge",
          property_id: mappedPropertyId,
          arrival_date: res.check_in,
          departure_date: res.check_out,
          contact_name: res.guest_name,
          contact_email: res.guest_email || null,
          contact_phone: res.guest_phone || null,
          number_of_guests: res.adults + (res.children || 0),
          number_of_rooms: 1,
          total_amount: res.total_amount,
          currency: res.currency || "ZAR",
          status: mapNightsBridgeStatus(res.status),
          rate_type_name: res.rate_name || null,
          rooms: JSON.stringify([{
            room_type: res.room_type,
            adults: res.adults,
            children: res.children || 0,
          }]),
          raw_data: res,
          synced_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("pms_reservations")
          .upsert(reservationData, {
            onConflict: "external_reservation_id,system_type",
          });

        if (upsertError) {
          console.error("Upsert error for reservation:", res.reference, upsertError);
          errors.push(`${res.reference}: ${upsertError.message}`);
          errorCount++;
        } else {
          syncedCount++;
        }
      } catch (err) {
        console.error("Error processing reservation:", res.reference, err);
        errors.push(`${res.reference}: ${err instanceof Error ? err.message : "Unknown error"}`);
        errorCount++;
      }
    }

    // Match booking sessions to synced reservations
    console.log("Matching booking sessions to reservations...");
    const matchResult = await matchSessionsToReservations(supabase, reservations);
    console.log(`Session matching complete: ${matchResult.matched} matched, ${matchResult.unmatched} unmatched`);

    // Log the sync operation
    await supabase.from("sync_logs").insert({
      external_system: "nightsbridge",
      sync_type: "reservations",
      status: errorCount === 0 ? "success" : errorCount < syncedCount ? "partial" : "failed",
      message: `Synced ${syncedCount} reservations, ${errorCount} errors, ${matchResult.matched} sessions matched`,
      request_data: { start_date: startDate, end_date: endDate, property_id: propertyId },
      response_data: { 
        total_received: reservations.length, 
        synced: syncedCount, 
        errors: errorCount,
        sessions_matched: matchResult.matched,
        sessions_unmatched: matchResult.unmatched,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${syncedCount} NightsBridge reservations`,
        data: {
          total_received: reservations.length,
          synced: syncedCount,
          errors: errorCount,
          sessions_matched: matchResult.matched,
          sessions_unmatched: matchResult.unmatched,
          error_details: errors.length > 0 ? errors.slice(0, 10) : undefined,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("NightsBridge sync error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Map NightsBridge status to our standard status
function mapNightsBridgeStatus(nbStatus: string): string {
  const statusMap: Record<string, string> = {
    confirmed: "confirmed",
    pending: "pending",
    cancelled: "cancelled",
    checked_in: "checked_in",
    checked_out: "completed",
    no_show: "no_show",
  };
  
  return statusMap[nbStatus?.toLowerCase()] || nbStatus || "unknown";
}

// Match synced reservations to pending booking sessions
async function matchSessionsToReservations(
  supabase: any,
  reservations: NightsBridgeReservation[]
): Promise<{ matched: number; unmatched: number }> {
  let matched = 0;
  let unmatched = 0;

  for (const res of reservations) {
    // Get the reservation creation time (or use check_in as fallback)
    const reservationTime = res.created_at 
      ? new Date(res.created_at) 
      : new Date(res.check_in);
    
    // Look for pending sessions within a 2-hour window before/30 min after reservation
    const windowStart = new Date(reservationTime.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(reservationTime.getTime() + 30 * 60 * 1000);

    // Find the property_id for this reservation
    let mappedPropertyId: string | null = null;
    if (res.property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("id")
        .eq("external_id", res.property_id)
        .eq("external_system", "nightsbridge")
        .maybeSingle();
      mappedPropertyId = property?.id || null;
    }

    if (!mappedPropertyId) {
      unmatched++;
      continue;
    }

    // Query for matching pending sessions
    const { data: sessions, error } = await supabase
      .from("nightsbridge_booking_sessions")
      .select("*")
      .eq("property_id", mappedPropertyId)
      .eq("status", "pending")
      .gte("session_started_at", windowStart.toISOString())
      .lte("session_started_at", windowEnd.toISOString());

    if (error) {
      console.error("Error querying sessions:", error);
      unmatched++;
      continue;
    }

    if (!sessions || sessions.length === 0) {
      unmatched++;
      continue;
    }

    // Determine match confidence based on session count and date matching
    let bestMatch = sessions[0];
    let confidence: "high" | "medium" | "low" = "low";

    if (sessions.length === 1) {
      // Single session = high confidence
      bestMatch = sessions[0];
      confidence = "high";
    } else {
      // Multiple sessions - try to match by dates
      const dateMatches = sessions.filter((s: any) => 
        s.check_in_date === res.check_in && s.check_out_date === res.check_out
      );
      
      if (dateMatches.length === 1) {
        bestMatch = dateMatches[0];
        confidence = "medium";
      } else if (dateMatches.length > 1) {
        // Multiple date matches - use the most recent
        bestMatch = dateMatches.sort((a: any, b: any) => 
          new Date(b.session_started_at).getTime() - new Date(a.session_started_at).getTime()
        )[0];
        confidence = "low";
      } else {
        // No date matches - use most recent session
        bestMatch = sessions.sort((a: any, b: any) => 
          new Date(b.session_started_at).getTime() - new Date(a.session_started_at).getTime()
        )[0];
        confidence = "low";
      }
    }

    // Update the matched session
    const { error: updateError } = await supabase
      .from("nightsbridge_booking_sessions")
      .update({
        matched_reservation_id: res.reference || res.id,
        matched_at: new Date().toISOString(),
        match_confidence: confidence,
        estimated_revenue: res.total_amount,
        revenue_currency: res.currency || "ZAR",
        status: "matched",
      })
      .eq("id", bestMatch.id);

    if (updateError) {
      console.error("Error updating session:", updateError);
      unmatched++;
    } else {
      matched++;
      console.log(`Matched session ${bestMatch.tracking_ref} to reservation ${res.reference} (${confidence} confidence)`);
    }
  }

  return { matched, unmatched };
}
