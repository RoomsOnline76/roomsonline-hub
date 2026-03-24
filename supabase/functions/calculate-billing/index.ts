import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BillingRequest {
  property_id: string;
  booking_id?: string;
  embed_session_id?: string;
  event_type: 'booking' | 'subscription' | 'transaction' | 'embed_usage';
  amount?: number;
}

interface BillingResult {
  amount: number;
  type: string;
  metadata: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: BillingRequest = await req.json();
    const { property_id, booking_id, event_type, amount } = payload;

    if (!property_id) {
      return new Response(
        JSON.stringify({ error: "property_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch billing config for this property
    const { data: config } = await supabase
      .from("property_billing_configs")
      .select("*")
      .eq("property_id", property_id)
      .single();

    const strategy = config?.billing_strategy || 'default';

    // Fetch booking details if booking_id provided
    let booking = null;
    if (booking_id) {
      const { data } = await supabase
        .from("bookings")
        .select("id, property_id, total_price, check_in_date, integration_type, booking_channel, source_url, payment_status")
        .eq("id", booking_id)
        .single();
      booking = data;
    }

    const bookingAmount = amount || booking?.total_price || 0;

    // Route to strategy calculator
    let result: BillingResult;

    switch (strategy) {
      case 'default':
        result = await calcDefault(supabase, property_id, booking, bookingAmount, config);
        break;
      case 'widget':
        result = await calcWidget(supabase, property_id, bookingAmount, config);
        break;
      case 'rolos_pms':
        result = await calcRolosPms(supabase, property_id, booking, bookingAmount, config, event_type);
        break;
      case 'portfolio_aggregator':
        result = await calcPortfolio(supabase, property_id, bookingAmount, config);
        break;
      case 'enterprise_white_label':
        result = await calcEnterprise(config, event_type);
        break;
      case 'volume_tiered':
        result = await calcVolumeTiered(supabase, property_id, bookingAmount, config);
        break;
      case 'payment_facilitator':
        result = await calcPaymentFacilitator(bookingAmount, config);
        break;
      default:
        result = await calcDefault(supabase, property_id, booking, bookingAmount, config);
    }

    // Log to billing_transactions
    const { error: txError } = await supabase
      .from("billing_transactions")
      .insert({
        property_id,
        owner_id: config?.owner_id || null,
        type: result.type,
        amount: result.amount,
        currency: 'ZAR',
        reference_id: booking_id || null,
        calculated_by: `billing-calc-${strategy}`,
        metadata: result.metadata,
      });

    if (txError) {
      console.error("Failed to log billing transaction:", txError);
    }

    // Also update booking commission fields if this is a booking event
    if (booking_id && result.type === 'commission') {
      await supabase
        .from("bookings")
        .update({
          calculated_commission: result.amount,
          commission_rate_applied: result.metadata.rate as number,
          commission_calculated_at: new Date().toISOString(),
          commission_type: result.metadata.commission_type as string || strategy,
        })
        .eq("id", booking_id);
    }

    return new Response(
      JSON.stringify({ success: true, strategy, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Billing calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Strategy Calculators ──

const PMS_INTEGRATION_TYPES = ['rolos', 'widget', 'embed', 'api', 'wordpress', 'booking_bar'];
const PMS_CHANNELS = ['direct', 'widget', 'embed', 'api'];

function resolveCommissionType(booking: any): 'listing' | 'pms' {
  if (!booking) return 'listing';
  if (booking.integration_type && PMS_INTEGRATION_TYPES.includes(booking.integration_type)) return 'pms';
  if (booking.booking_channel && PMS_CHANNELS.includes(booking.booking_channel)) return 'pms';
  if (booking.source_url && (
    booking.source_url.includes('widget') ||
    booking.source_url.includes('embed') ||
    booking.source_url.includes('wordpress')
  )) return 'pms';
  return 'listing';
}

async function calcDefault(
  supabase: any, propertyId: string, booking: any, amount: number, config: any
): Promise<BillingResult> {
  const commissionType = resolveCommissionType(booking);
  const defaultRate = commissionType === 'pms' ? 2 : 10;

  // Check commercial terms first
  const checkInDate = booking?.check_in_date || new Date().toISOString().split('T')[0];
  const { data: terms } = await supabase
    .from("property_commercial_terms")
    .select("revenue_share_percent")
    .eq("property_id", propertyId)
    .eq("contract_status", "active")
    .eq("commission_type", commissionType)
    .lte("effective_from", checkInDate)
    .order("effective_from", { ascending: false })
    .limit(1);

  const rate = terms?.[0]?.revenue_share_percent ?? config?.commission_rate ?? defaultRate;
  const commission = amount * (rate / 100);

  return {
    amount: commission,
    type: 'commission',
    metadata: { rate, commission_type: commissionType, source: terms?.[0] ? 'commercial_term' : 'config' },
  };
}

async function calcWidget(
  supabase: any, propertyId: string, amount: number, config: any
): Promise<BillingResult> {
  // Fetch widget tier mappings
  const { data: mappings } = await supabase
    .from("billing_mappings")
    .select("field, value")
    .eq("strategy", "widget");

  // Count monthly bookings for tier resolution
  const monthStart = new Date();
  monthStart.setDate(1);
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: 'exact', head: true })
    .eq("property_id", propertyId)
    .gte("created_at", monthStart.toISOString());

  const monthlyVolume = count || 0;
  let rate = config?.commission_rate ?? 8;

  // Apply tier from mappings if available
  if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      if (m.field === 'tier_threshold') {
        try {
          const tiers = JSON.parse(m.value);
          for (const [threshold, tierRate] of Object.entries(tiers).sort(([a], [b]) => Number(b) - Number(a))) {
            if (monthlyVolume >= Number(threshold)) {
              rate = Number(tierRate);
              break;
            }
          }
        } catch { /* use default */ }
      }
    }
  }

  return {
    amount: amount * (rate / 100),
    type: 'commission',
    metadata: { rate, monthly_volume: monthlyVolume, source: 'widget_tier' },
  };
}

async function calcRolosPms(
  supabase: any, propertyId: string, booking: any, amount: number, config: any, eventType: string
): Promise<BillingResult> {
  if (eventType === 'subscription') {
    return {
      amount: config?.subscription_fee_monthly ?? 0,
      type: 'subscription',
      metadata: { period: 'monthly' },
    };
  }

  // Per-booking fee
  const rate = config?.commission_rate ?? 2;
  return {
    amount: amount * (rate / 100),
    type: 'commission',
    metadata: { rate, source: 'rolos_pms' },
  };
}

async function calcPortfolio(
  supabase: any, propertyId: string, amount: number, config: any
): Promise<BillingResult> {
  const rate = config?.commission_rate ?? 5;
  return {
    amount: amount * (rate / 100),
    type: 'commission',
    metadata: { rate, source: 'portfolio_aggregator' },
  };
}

async function calcEnterprise(config: any, eventType: string): Promise<BillingResult> {
  if (eventType === 'subscription') {
    return {
      amount: config?.subscription_fee_monthly ?? 0,
      type: 'subscription',
      metadata: { period: 'monthly', source: 'enterprise_white_label' },
    };
  }
  // 0% commission for enterprise
  return {
    amount: 0,
    type: 'commission',
    metadata: { rate: 0, source: 'enterprise_white_label' },
  };
}

async function calcVolumeTiered(
  supabase: any, propertyId: string, amount: number, config: any
): Promise<BillingResult> {
  let rate = config?.commission_rate ?? 10;

  // Get unit count from property
  const { data: property } = await supabase
    .from("properties")
    .select("total_rooms")
    .eq("id", propertyId)
    .single();

  const unitCount = property?.total_rooms ?? 1;

  // Apply volume tiers from config
  if (config?.volume_tier_json) {
    try {
      const tiers = config.volume_tier_json as Record<string, number>;
      const sortedTiers = Object.entries(tiers)
        .map(([range, tierRate]) => {
          const lower = parseInt(range.split('-')[0].replace('+', ''));
          return { lower, rate: Number(tierRate) };
        })
        .sort((a, b) => b.lower - a.lower);

      for (const tier of sortedTiers) {
        if (unitCount >= tier.lower) {
          rate = tier.rate;
          break;
        }
      }
    } catch { /* use default */ }
  }

  return {
    amount: amount * (rate / 100),
    type: 'commission',
    metadata: { rate, unit_count: unitCount, source: 'volume_tiered' },
  };
}

async function calcPaymentFacilitator(amount: number, config: any): Promise<BillingResult> {
  const rate = config?.transaction_fee_percentage ?? 2.5;
  return {
    amount: amount * (rate / 100),
    type: 'transaction_fee',
    metadata: { rate, source: 'payment_facilitator' },
  };
}
