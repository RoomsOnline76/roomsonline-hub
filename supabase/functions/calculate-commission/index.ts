import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingInput {
  id: string;
  property_id: string;
  total_price: number;
  check_in_date: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { booking_id, recalculate_all } = await req.json();

    // If recalculate_all is true, process all paid bookings without commission
    if (recalculate_all) {
      const { data: bookings, error: fetchError } = await supabase
        .from("bookings")
        .select("id, property_id, total_price, check_in_date")
        .eq("payment_status", "paid")
        .is("calculated_commission", null);

      if (fetchError) throw fetchError;

      let processed = 0;
      for (const booking of (bookings || []) as BookingInput[]) {
        await calculateAndUpdateCommission(supabase, booking);
        processed++;
      }

      return new Response(
        JSON.stringify({ success: true, processed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single booking calculation
    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, property_id, total_price, check_in_date, payment_status")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only calculate for paid bookings
    if (booking.payment_status !== "paid") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Booking is not paid yet",
          booking_id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await calculateAndUpdateCommission(supabase, booking as BookingInput);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Commission calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculateAndUpdateCommission(
  supabase: any,
  booking: BookingInput
) {
  const { id, property_id, total_price, check_in_date } = booking;

  // Look up active commercial term for property at booking date
  const { data: terms } = await supabase
    .from("property_commercial_terms")
    .select("revenue_share_percent")
    .eq("property_id", property_id)
    .eq("contract_status", "active")
    .lte("effective_from", check_in_date)
    .order("effective_from", { ascending: false })
    .limit(1);

  // Use default 10% if no active term found
  const term = terms && terms.length > 0 ? terms[0] : null;
  const rate = term?.revenue_share_percent ?? 10.00;
  const commission = total_price * (rate / 100);

  // Update booking with calculated commission
  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      calculated_commission: commission,
      commission_rate_applied: rate,
      commission_calculated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw updateError;

  return {
    booking_id: id,
    total_price,
    commission_rate: rate,
    calculated_commission: commission,
    source: term ? "commercial_term" : "default",
  };
}
