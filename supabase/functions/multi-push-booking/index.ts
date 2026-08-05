import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ItineraryStay {
  id: string;
  property_id: string;
  property_name: string;
  external_system: string;
  dates: { check_in: string; check_out: string };
  rooms: { room_type_id: string; room_type_name: string; quantity: number; rate_per_night: number; total_price: number }[];
  guests: { adults: number; children: number; infants: number };
  rate_type_id?: string;
  price_breakdown: { subtotal: number; total: number };
}

interface BookingResult {
  stay_index: number;
  property_id: string;
  property_name: string;
  booking_id?: string;
  external_reservation_id?: string;
  status: 'success' | 'failed' | 'rolled_back' | 'skipped';
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { itinerary_id } = await req.json();

    if (!itinerary_id) {
      return new Response(
        JSON.stringify({ success: false, error: "itinerary_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", itinerary_id)
      .single();

    if (itinError || !itinerary) {
      return new Response(
        JSON.stringify({ success: false, error: "Itinerary not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stays = itinerary.stays as ItineraryStay[];
    if (!stays || stays.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No stays in itinerary" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update itinerary status to pending
    await supabase
      .from("itineraries")
      .update({ status: "pending" })
      .eq("id", itinerary_id);

    const results: BookingResult[] = [];
    const successfulBookings: { booking_id: string; property_id: string; external_system: string }[] = [];
    let hasFailure = false;

    // Check for existing placeholder booking (created by JourneyCheckout for PayFast)
    // This prevents duplicate bookings for the same itinerary
    const { data: existingPlaceholders } = await supabase
      .from("bookings")
      .select("id, property_id, payment_status, status")
      .eq("booking_channel", "rol_itinerary")
      .filter("ai_metadata->>itinerary_id", "eq", itinerary_id);

    // Create a map of property_id -> existing placeholder booking
    const placeholderMap = new Map<string, { id: string; payment_status: string; status: string }>();
    (existingPlaceholders || []).forEach(p => {
      // Only reuse paid/confirmed placeholders - these are the real bookings
      if (p.payment_status === 'paid' || p.status === 'confirmed') {
        placeholderMap.set(p.property_id, { id: p.id, payment_status: p.payment_status, status: p.status });
      }
    });

    console.log(`Found ${placeholderMap.size} existing placeholder booking(s) for itinerary ${itinerary_id}`);

    // Process each stay sequentially
    for (let i = 0; i < stays.length; i++) {
      const stay = stays[i];

      if (hasFailure) {
        results.push({
          stay_index: i,
          property_id: stay.property_id,
          property_name: stay.property_name,
          status: 'skipped',
          error: 'Skipped due to previous failure'
        });
        continue;
      }

      try {
        console.log(`Processing stay ${i + 1}/${stays.length}: ${stay.property_name}`);

        // Check if we already have a placeholder booking for this property
        const existingPlaceholder = placeholderMap.get(stay.property_id);
        let bookingId: string;

        if (existingPlaceholder) {
          // REUSE existing placeholder - don't create a new booking
          console.log(`Reusing existing placeholder booking ${existingPlaceholder.id} for ${stay.property_name}`);
          bookingId = existingPlaceholder.id;
          
          // Remove from map so we don't reuse it for another stay
          placeholderMap.delete(stay.property_id);
        } else {
          // Create new booking record (for multi-stay journeys where no placeholder exists)
          const bookingData = {
            property_id: stay.property_id,
            guest_name: itinerary.guest_name || 'Guest',
            guest_email: itinerary.guest_email || '',
            guest_phone: itinerary.guest_phone || null,
            check_in_date: stay.dates.check_in,
            check_out_date: stay.dates.check_out,
            adults: stay.guests.adults,
            children: stay.guests.children || 0,
            infants: stay.guests.infants || 0,
            total_price: stay.price_breakdown.total,
            rooms: stay.rooms,
            rate_type_id: stay.rate_type_id || null,
            special_requests: itinerary.special_requests || null,
            status: 'pending',
            booking_channel: 'rol_itinerary',
            ai_metadata: { itinerary_id }
          };

          const { data: booking, error: bookingError } = await supabase
            .from("bookings")
            .insert(bookingData)
            .select("id")
            .single();

          if (bookingError || !booking) {
            throw new Error(`Failed to create booking record: ${bookingError?.message}`);
          }
          bookingId = booking.id;
        }
        
        const booking = { id: bookingId };

        // Link booking to itinerary
        await supabase
          .from("itinerary_bookings")
          .insert({
            itinerary_id,
            booking_id: booking.id,
            stay_index: i,
            property_id: stay.property_id,
            status: 'pending'
          });

        // Call push-booking for PMS verification (RULE #1)
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/push-booking`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ booking_id: booking.id })
        });

        const pushResult = await pushResponse.json();

        if (!pushResponse.ok || pushResult.error) {
          // Mark booking as failed
          await supabase
            .from("bookings")
            .update({ status: 'failed' })
            .eq("id", booking.id);

          await supabase
            .from("itinerary_bookings")
            .update({ status: 'failed', error_message: pushResult.error || 'Push failed' })
            .eq("booking_id", booking.id);

          hasFailure = true;
          results.push({
            stay_index: i,
            property_id: stay.property_id,
            property_name: stay.property_name,
            booking_id: booking.id,
            status: 'failed',
            error: pushResult.error || 'Booking push failed'
          });
          continue;
        }

        // Success - update records
        await supabase
          .from("bookings")
          .update({ 
            status: 'confirmed',
            external_reservation_id: pushResult.externalReservationId || null
          })
          .eq("id", booking.id);

        await supabase
          .from("itinerary_bookings")
          .update({ 
            status: 'confirmed',
            external_reservation_id: pushResult.externalReservationId || null
          })
          .eq("booking_id", booking.id);

        successfulBookings.push({
          booking_id: booking.id,
          property_id: stay.property_id,
          external_system: stay.external_system
        });

        results.push({
          stay_index: i,
          property_id: stay.property_id,
          property_name: stay.property_name,
          booking_id: booking.id,
          external_reservation_id: pushResult.externalReservationId,
          status: 'success'
        });

      } catch (stayError) {
        console.error(`Error processing stay ${i}:`, stayError);
        hasFailure = true;
        results.push({
          stay_index: i,
          property_id: stay.property_id,
          property_name: stay.property_name,
          status: 'failed',
          error: stayError instanceof Error ? stayError.message : 'Unknown error'
        });
      }
    }

    // If there was a failure, attempt rollback of successful bookings
    let rollbackPerformed = false;
    if (hasFailure && successfulBookings.length > 0) {
      console.log(`Failure detected. Attempting rollback of ${successfulBookings.length} successful bookings...`);
      rollbackPerformed = true;

      for (const success of successfulBookings) {
        try {
          // Mark as rolled back (actual PMS cancellation would happen here)
          await supabase
            .from("bookings")
            .update({ status: 'cancelled' })
            .eq("id", success.booking_id);

          await supabase
            .from("itinerary_bookings")
            .update({ status: 'rolled_back' })
            .eq("booking_id", success.booking_id);

          // Update result
          const resultIndex = results.findIndex(r => r.booking_id === success.booking_id);
          if (resultIndex >= 0) {
            results[resultIndex].status = 'rolled_back';
          }
        } catch (rollbackError) {
          console.error(`Rollback failed for booking ${success.booking_id}:`, rollbackError);
        }
      }
    }

    // Update itinerary final status
    const finalStatus = hasFailure ? 'cancelled' : 'confirmed';
    await supabase
      .from("itineraries")
      .update({ status: finalStatus })
      .eq("id", itinerary_id);

    // If successful, trigger itinerary confirmation email
    if (!hasFailure) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-itinerary-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ 
            itinerary_id,
            status: 'success'
          })
        });
        console.log('Itinerary confirmation email triggered');
      } catch (emailError) {
        console.error('Itinerary email notification failed:', emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: !hasFailure,
        itinerary_id,
        booking_results: results,
        rollback_performed: rollbackPerformed,
        partial_success: hasFailure && successfulBookings.length > 0,
        final_status: finalStatus
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Multi-push booking error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Booking orchestration failed" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
