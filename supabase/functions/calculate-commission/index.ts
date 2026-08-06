import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ALL_REVENUE_PAYMENT_STATUSES,
  isRevenuePaymentStatus,
  isChannelSettled,
} from "../_shared/revenueStatuses.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingInput {
  id: string;
  payment_status?: string | null;
  property_id: string;
  total_price: number;
  check_in_date: string;
  integration_type?: string | null;
  booking_channel?: string | null;
  source_url?: string | null;
}

const PMS_INTEGRATION_TYPES = ['rolos', 'widget', 'embed', 'api', 'wordpress', 'booking_bar'];
const PMS_CHANNELS = ['direct', 'widget', 'embed', 'api'];

function resolveCommissionType(booking: BookingInput): 'listing' | 'pms' {
  if (booking.integration_type && PMS_INTEGRATION_TYPES.includes(booking.integration_type)) {
    return 'pms';
  }
  if (booking.booking_channel && PMS_CHANNELS.includes(booking.booking_channel)) {
    return 'pms';
  }
  if (booking.source_url && (
    booking.source_url.includes('widget') || 
    booking.source_url.includes('embed') ||
    booking.source_url.includes('wordpress')
  )) {
    return 'pms';
  }
  return 'listing';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { booking_id, recalculate_all } = await req.json();

    if (recalculate_all) {
      const { data: bookings, error: fetchError } = await supabase
        .from("bookings")
        .select("id, property_id, total_price, check_in_date, payment_status, integration_type, booking_channel, source_url")
        .in("payment_status", ALL_REVENUE_PAYMENT_STATUSES)
        .not("status", "in", '("cancelled","failed")')
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

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, property_id, total_price, check_in_date, payment_status, integration_type, booking_channel, source_url")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Channel-collected funds (payment_status 'paid_externally', e.g. Rentals
    // United) are real revenue — commission is owed to ROL even though the
    // money never passed through our gateway.
    if (!isRevenuePaymentStatus(booking.payment_status)) {
      return new Response(
        JSON.stringify({ success: false, message: "Booking is not paid yet", booking_id }),
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

async function calculateAndUpdateCommission(
  supabase: any,
  booking: BookingInput
) {
  const { id, property_id, total_price, check_in_date } = booking;
  const commissionType = resolveCommissionType(booking);
  const defaultRate = commissionType === 'pms' ? 2 : 10;

  // Look up active commercial term for property at booking date, filtered by commission type
  const { data: terms } = await supabase
    .from("property_commercial_terms")
    .select("revenue_share_percent")
    .eq("property_id", property_id)
    .eq("contract_status", "active")
    .eq("commission_type", commissionType)
    .lte("effective_from", check_in_date)
    .order("effective_from", { ascending: false })
    .limit(1);

  const term = terms && terms.length > 0 ? terms[0] : null;
  const rate = term?.revenue_share_percent ?? defaultRate;
  const commission = total_price * (rate / 100);

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      calculated_commission: commission,
      commission_rate_applied: rate,
      commission_calculated_at: new Date().toISOString(),
      commission_type: commissionType,
    })
    .eq("id", id);

  if (updateError) throw updateError;

  return {
    booking_id: id,
    total_price,
    commission_type: commissionType,
    commission_rate: rate,
    calculated_commission: commission,
    source: term ? "commercial_term" : "default",
    // Flags commission that must be invoiced rather than netted off a payout,
    // because the channel/BYO gateway holds the guest funds.
    channel_settled: isChannelSettled(booking.payment_status),
  };
}
