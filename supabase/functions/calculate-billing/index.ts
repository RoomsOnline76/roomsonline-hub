import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getEffectiveBillingRate,
  loadGatewaySchedule,
  loadPeriodVolume,
  isBillableScheduleSource,
} from "../_shared/gatewayBillingRate.ts";

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

Deno.serve(async (req) => {
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

    // Fetch billing config — portfolio-level config wins when the property belongs to one.
    let config: any = null;
    const { data: membership } = await supabase
      .from("property_portfolio_members")
      .select("portfolio_id")
      .eq("property_id", property_id)
      .limit(1)
      .maybeSingle();
    if (membership?.portfolio_id) {
      const { data: portfolioConfig } = await supabase
        .from("portfolio_billing_configs")
        .select("*")
        .eq("portfolio_id", membership.portfolio_id)
        .maybeSingle();
      if (portfolioConfig) config = portfolioConfig;
    }
    if (!config) {
      const { data: propertyConfig } = await supabase
        .from("property_billing_configs")
        .select("*")
        .eq("property_id", property_id)
        .maybeSingle();
      config = propertyConfig;
    }

    const strategy = config?.billing_strategy || 'default';


    // Fetch global defaults for the strategy (3-tier resolution)
    const { data: allGlobalRows } = await supabase
      .from("billing_global_defaults")
      .select("*");

    // Merge globals field-by-field: the strategy's own row wins, then a generic
    // `default` row, then any row that defines the field. Nothing is hard-wired.
    const globalDefaults: Record<string, any> = (() => {
      const rows: any[] = allGlobalRows || [];
      if (!rows.length) return {};
      const want = String(strategy || "default").toLowerCase();
      const ordered = [
        ...rows.filter((r) => String(r.strategy || "").toLowerCase() === want),
        ...rows.filter((r) => String(r.strategy || "").toLowerCase() === "default"),
        ...rows,
      ];
      const merged: Record<string, any> = {};
      for (const row of ordered) {
        for (const [k, v] of Object.entries(row || {})) {
          if (merged[k] == null && v != null) merged[k] = v;
        }
      }
      return merged;
    })();

    // Resolve helper: property override → global default → hardcoded fallback
    const resolve = (
      propertyVal: number | null | undefined,
      globalVal: number | null | undefined,
      fallback: number
    ): number => {
      if (propertyVal != null) return propertyVal;
      if (globalVal != null) return globalVal;
      return fallback;
    };

    // Fetch booking details if booking_id provided
    let booking = null;
    if (booking_id) {
      const { data } = await supabase
        .from("bookings")
        .select("id, property_id, total_price, check_in_date, integration_type, booking_channel, source_url, commission_type, payment_status")
        .eq("id", booking_id)
        .single();
      booking = data;
    }

    const bookingAmount = amount || booking?.total_price || 0;

    // Route to strategy calculator
    let result: BillingResult;

    switch (strategy) {
      case 'default':
        result = await calcDefault(supabase, property_id, booking, bookingAmount, config, globalDefaults, resolve);
        break;
      case 'widget':
        result = await calcWidget(supabase, property_id, bookingAmount, config, globalDefaults, resolve);
        break;
      case 'rolos_pms':
        result = await calcRolosPms(bookingAmount, config, globalDefaults, resolve, event_type);
        break;
      case 'portfolio_aggregator':
        // Legacy strategy — aggregator is now a portfolio-level add-on; route booking commission through default.
        result = await calcDefault(supabase, property_id, booking, bookingAmount, config, globalDefaults, resolve);
        break;
      case 'enterprise_white_label':
        result = await calcEnterprise(config, globalDefaults, resolve, event_type);
        break;
      case 'volume_tiered':
        result = await calcVolumeTiered(supabase, property_id, bookingAmount, config, globalDefaults, resolve);
        break;
      case 'payment_facilitator':
        result = await calcPaymentFacilitator(supabase, property_id, bookingAmount, config, globalDefaults, resolve);
        break;
      default:
        result = await calcDefault(supabase, property_id, booking, bookingAmount, config, globalDefaults, resolve);
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

    // Facilitator surcharge stacks on commission strategies when ROL processes payment.
    // Base = booking amount only (never compounds on commission or add-ons).
    // Skipped when strategy is 'payment_facilitator' (already surcharge-only) or when BYO gateway is active.
    //
    // When the property (or its portfolio) is assigned a versioned gateway
    // schedule, the fee is resolved from that schedule — percentage + fixed fee,
    // volume-banded on trailing-30-day paid booking value. The active global
    // schedule counts as assigned, so the schedule is the single source for the
    // processing rate; the legacy flat percentage applies only when no active
    // schedule exists at all.
    if (
      event_type === 'booking' &&
      booking_id &&
      strategy !== 'payment_facilitator' &&
      config?.payment_facilitator_enabled === true &&
      !(config?.byo_gateway_monthly_fee > 0)
    ) {
      const schedule = await loadGatewaySchedule(supabase, property_id);
      const usingSchedule = isBillableScheduleSource(schedule.source);

      if (usingSchedule && bookingAmount > 0) {
        const periodVolume = await loadPeriodVolume(supabase, property_id);
        const rate = getEffectiveBillingRate(schedule.config, bookingAmount, periodVolume, schedule.overrides);
        if (rate.amount_charged > 0) {
          await supabase.from("billing_transactions").insert({
            property_id,
            owner_id: config?.owner_id || null,
            type: 'transaction_fee',
            amount: rate.amount_charged,
            currency: rate.currency || 'ZAR',
            reference_id: booking_id,
            calculated_by: 'billing-calc-gateway-schedule',
            metadata: {
              rate: rate.percentage,
              fixed_fee: rate.fixed_fee,
              effective_rate: rate.effective_rate,
              model: rate.model,
              tier: rate.tier,
              period_volume: periodVolume,
              config_id: rate.config_id,
              config_version: rate.config_version,
              config_source: schedule.source,
              used_override: rate.usedOverride,
              source: 'gateway_schedule',
              base: 'booking_amount',
              booking_amount: bookingAmount,
            },
          });
        }
      } else {
        const surchargeRate = resolve(
          config?.transaction_fee_percentage,
          globalDefaults?.default_transaction_fee,
          2.5
        );
        if (surchargeRate > 0 && bookingAmount > 0) {
          const surchargeAmount = bookingAmount * (surchargeRate / 100);
          await supabase.from("billing_transactions").insert({
            property_id,
            owner_id: config?.owner_id || null,
            type: 'transaction_fee',
            amount: surchargeAmount,
            currency: 'ZAR',
            reference_id: booking_id,
            calculated_by: 'billing-calc-facilitator-surcharge',
            metadata: {
              rate: surchargeRate,
              source: 'facilitator_surcharge',
              base: 'booking_amount',
              booking_amount: bookingAmount,
            },
          });
        }
      }
    }



    // Log white-label fee as separate transaction if enabled
    if (config?.white_label_allowed && event_type === 'subscription') {
      const wlFee = resolve(
        config?.white_label_monthly_fee,
        globalDefaults?.white_label_monthly_fee,
        0
      );
      if (wlFee > 0) {
        await supabase
          .from("billing_transactions")
          .insert({
            property_id,
            owner_id: config?.owner_id || null,
            type: 'white_label_fee',
            amount: wlFee,
            currency: 'ZAR',
            calculated_by: 'billing-calc-white-label',
            metadata: { source: 'white_label_addon', monthly_fee: wlFee },
          });
      }
    }

    // Log PriceLabs add-on fee — only when admin-allowed AND client activated in ROL'OS AND PMS = ROL'OS
    if ((config as any)?.pricelabs_allowed && event_type === 'subscription') {
      const { data: propRow } = await supabase
        .from("properties")
        .select("pms_system, pricelabs_config")
        .eq("id", property_id)
        .maybeSingle();
      const isRolos = ((propRow as any)?.pms_system ?? "").toLowerCase() === "rolos";
      const activated = !!((propRow as any)?.pricelabs_config?.enabled);
      if (isRolos && activated) {
        const plFee = resolve(
          (config as any)?.pricelabs_monthly_fee,
          (globalDefaults as any)?.pricelabs_monthly_fee,
          0
        );
        if (plFee > 0) {
          await supabase
            .from("billing_transactions")
            .insert({
              property_id,
              owner_id: config?.owner_id || null,
              type: 'pricelabs_fee',
              amount: plFee,
              currency: 'ZAR',
              calculated_by: 'billing-calc-pricelabs',
              metadata: { source: 'pricelabs_addon', monthly_fee: plFee, activated: true },
            });
        }
      }
    }

    // Portfolio Aggregator add-on: log a monthly / setup fee once per portfolio the property belongs to
    if (event_type === 'subscription') {
      try {
        const { data: memberships } = await supabase
          .from('property_portfolio_members')
          .select('portfolio_id')
          .eq('property_id', property_id);
        const portfolioIds = (memberships || []).map((m: any) => m.portfolio_id).filter(Boolean);
        if (portfolioIds.length) {
          const { data: portfolios } = await supabase
            .from('property_portfolios')
            .select('id, aggregator_billing_mode, aggregator_monthly_fee, aggregator_setup_fee, aggregator_activated_at')
            .in('id', portfolioIds);
          const { data: aggDefaults } = await supabase
            .from('billing_global_defaults')
            .select('portfolio_aggregator_billing_mode, portfolio_aggregator_monthly_default, portfolio_aggregator_setup_default')
            .limit(1)
            .maybeSingle();
          for (const p of portfolios || []) {
            const mode = (p as any).aggregator_billing_mode || (aggDefaults as any)?.portfolio_aggregator_billing_mode || 'none';
            if (mode === 'none') continue;
            // Ensure we only bill each portfolio once per subscription cycle → use the alphabetically first member as the anchor
            const { data: firstMember } = await supabase
              .from('property_portfolio_members')
              .select('property_id')
              .eq('portfolio_id', (p as any).id)
              .order('property_id')
              .limit(1)
              .maybeSingle();
            if ((firstMember as any)?.property_id !== property_id) continue;

            if (mode === 'monthly') {
              const monthly = resolve(
                (p as any).aggregator_monthly_fee,
                (aggDefaults as any)?.portfolio_aggregator_monthly_default,
                0
              );
              if (monthly > 0) {
                await supabase.from('billing_transactions').insert({
                  property_id,
                  owner_id: config?.owner_id || null,
                  type: 'portfolio_aggregator_fee',
                  amount: monthly,
                  currency: 'ZAR',
                  calculated_by: 'billing-calc-portfolio-aggregator',
                  metadata: { source: 'portfolio_aggregator_addon', portfolio_id: (p as any).id, mode, monthly_fee: monthly },
                });
              }
            } else if (mode === 'once_off' && !(p as any).aggregator_activated_at) {
              const setup = resolve(
                (p as any).aggregator_setup_fee,
                (aggDefaults as any)?.portfolio_aggregator_setup_default,
                0
              );
              if (setup > 0) {
                await supabase.from('billing_transactions').insert({
                  property_id,
                  owner_id: config?.owner_id || null,
                  type: 'portfolio_aggregator_setup',
                  amount: setup,
                  currency: 'ZAR',
                  calculated_by: 'billing-calc-portfolio-aggregator',
                  metadata: { source: 'portfolio_aggregator_addon', portfolio_id: (p as any).id, mode, setup_fee: setup },
                });
                await supabase
                  .from('property_portfolios')
                  .update({ aggregator_activated_at: new Date().toISOString() } as any)
                  .eq('id', (p as any).id);
              }
            }
          }
        }
      } catch (e) {
        console.error('portfolio aggregator billing skipped:', e);
      }
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

type ResolveFn = (prop: number | null | undefined, global: number | null | undefined, fallback: number) => number;

const PMS_INTEGRATION_TYPES = ['rolos', 'widget', 'embed', 'api', 'wordpress', 'booking_bar'];
const PMS_CHANNELS = ['direct', 'widget', 'embed', 'api', 'white_label', 'whitelabel'];
const EXTERNAL_CHANNELS = ['booking.com', 'booking_com', 'expedia', 'airbnb', 'vrbo', 'lekkeslaap', 'google', 'hyperguest', 'nightsbridge', 'channel'];

const LISTING_INTEGRATION_TYPES = ['rol_marketplace', 'marketplace', 'listing'];
const LISTING_CHANNELS = ['marketplace', 'rol_itinerary', 'journey', 'listing'];

function resolveCommissionType(booking: any): 'listing' | 'pms' | 'external' {
  if (!booking) return 'pms';
  const stored = String(booking.commission_type || '').toLowerCase();
  if (stored === 'pms' || stored === 'external') return stored;
  const hasOrigin = !!(booking.integration_type || booking.booking_channel || booking.source_url);
  if (stored === 'listing' && hasOrigin) return 'listing';
  const channel = String(booking.booking_channel || '').toLowerCase();
  if (channel && EXTERNAL_CHANNELS.some((c) => channel.includes(c))) return 'external';
  if (booking.integration_type && PMS_INTEGRATION_TYPES.includes(booking.integration_type)) return 'pms';
  if (channel && PMS_CHANNELS.includes(channel)) return 'pms';
  if (booking.source_url && (
    booking.source_url.includes('widget') ||
    booking.source_url.includes('embed') ||
    booking.source_url.includes('wordpress') ||
    booking.source_url.includes('wl=1')
  )) return 'pms';
  if (booking.integration_type && LISTING_INTEGRATION_TYPES.includes(booking.integration_type)) return 'listing';
  if (channel && LISTING_CHANNELS.includes(channel)) return 'listing';
  // Nothing marks this as a ROL marketplace booking → property's own surface.
  return 'pms';
}

async function calcDefault(
  supabase: any, propertyId: string, booking: any, amount: number, config: any, globals: any, resolve: ResolveFn
): Promise<BillingResult> {
  const commissionType = resolveCommissionType(booking);

  // Reservations pushed in from third-party channels carry no ROL commission —
  // the OTA already bills the property directly.
  if (commissionType === 'external') {
    return {
      amount: 0,
      type: 'commission',
      metadata: { rate: 0, commission_type: 'external', source: 'channel_sourced' },
    };
  }

  // Last-resort fallback only — every layer above (commercial term, property or
  // portfolio billing config, global defaults) overrides these.
  const hardcodedDefault = commissionType === 'pms' ? 2 : 10;

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

  // Per-origin rate: dedicated column → legacy shared column → global default → hardcoded.
  const configRate = commissionType === 'pms'
    ? (config?.pms_commission_rate ?? config?.widget_flat_commission_rate)
    : (config?.listing_commission_rate ?? config?.commission_rate);
  const globalRate = commissionType === 'pms'
    ? (globals?.pms_commission_rate ?? globals?.widget_flat_commission_rate ?? null)
    : (globals?.listing_commission_rate ?? globals?.default_commission_rate);

  const rate = terms?.[0]?.revenue_share_percent
    ?? resolve(configRate, globalRate, hardcodedDefault);
  const commission = amount * (rate / 100);

  return {
    amount: commission,
    type: 'commission',
    metadata: { rate, commission_type: commissionType, source: terms?.[0] ? 'commercial_term' : 'config' },
  };
}


async function calcWidget(
  supabase: any, propertyId: string, amount: number, config: any, globals: any, resolve: ResolveFn
): Promise<BillingResult> {
  const { data: mappings } = await supabase
    .from("billing_mappings")
    .select("field, value")
    .eq("strategy", "widget");

  const monthStart = new Date();
  monthStart.setDate(1);
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: 'exact', head: true })
    .eq("property_id", propertyId)
    .gte("created_at", monthStart.toISOString());

  const monthlyVolume = count || 0;
  let rate = resolve(config?.commission_rate, globals?.default_commission_rate, 8);
  let source = 'widget_default';

  // Flat widget commission takes precedence over tiered when set.
  const flat = config?.widget_flat_commission_rate ?? globals?.widget_flat_commission_rate ?? null;
  if (flat != null) {
    rate = Number(flat);
    source = 'widget_flat';
  } else if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      if (m.field === 'tier_threshold') {
        try {
          const tiers = JSON.parse(m.value);
          for (const [threshold, tierRate] of Object.entries(tiers).sort(([a], [b]) => Number(b) - Number(a))) {
            if (monthlyVolume >= Number(threshold)) {
              rate = Number(tierRate);
              source = 'widget_tier';
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
    metadata: { rate, monthly_volume: monthlyVolume, source },

  };
}

async function calcRolosPms(
  amount: number, config: any, globals: any, resolve: ResolveFn, eventType: string
): Promise<BillingResult> {
  if (eventType === 'subscription') {
    const baseFee = resolve(config?.subscription_fee_monthly, globals?.default_subscription_fee, null);
    const custom = resolve(config?.enterprise_custom_fee, globals?.enterprise_custom_fee, null);
    const fee = baseFee != null && baseFee > 0 ? baseFee : (custom ?? 0);
    return {
      amount: fee,
      type: 'subscription',
      metadata: { period: 'monthly', source: baseFee != null && baseFee > 0 ? 'tier_or_override' : (custom != null ? 'enterprise_custom' : 'unset') },
    };
  }

  const rate = resolve(
    config?.pms_commission_rate ?? config?.commission_rate,
    globals?.pms_commission_rate ?? globals?.default_commission_rate,
    2,
  );

  return {
    amount: amount * (rate / 100),
    type: 'commission',
    metadata: { rate, source: 'rolos_pms' },
  };
}

// (Legacy calcPortfolio removed — Portfolio Aggregator is now an add-on, not a strategy.)


async function calcEnterprise(config: any, globals: any, resolve: ResolveFn, eventType: string): Promise<BillingResult> {
  if (eventType === 'subscription') {
    const fee = resolve(config?.subscription_fee_monthly, globals?.default_subscription_fee, 0);
    return {
      amount: fee,
      type: 'subscription',
      metadata: { period: 'monthly', source: 'enterprise_white_label' },
    };
  }
  return {
    amount: 0,
    type: 'commission',
    metadata: { rate: 0, source: 'enterprise_white_label' },
  };
}

async function calcVolumeTiered(
  supabase: any, propertyId: string, amount: number, config: any, globals: any, resolve: ResolveFn
): Promise<BillingResult> {
  let rate = resolve(config?.commission_rate, globals?.default_commission_rate, 10);

  const { data: property } = await supabase
    .from("properties")
    .select("total_rooms")
    .eq("id", propertyId)
    .single();

  const unitCount = property?.total_rooms ?? 1;

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

async function calcPaymentFacilitator(
  supabase: any,
  propertyId: string,
  amount: number,
  config: any,
  globals: any,
  resolve: ResolveFn,
): Promise<BillingResult> {
  // Surcharge-only properties resolve through the same gateway schedule as every
  // other ROL-processed property, so there is one rate path in the system.
  const schedule = await loadGatewaySchedule(supabase, propertyId);
  if (isBillableScheduleSource(schedule.source)) {
    const periodVolume = await loadPeriodVolume(supabase, propertyId);
    const rate = getEffectiveBillingRate(schedule.config, amount, periodVolume, schedule.overrides);
    return {
      amount: rate.amount_charged,
      type: 'transaction_fee',
      metadata: {
        rate: rate.percentage,
        fixed_fee: rate.fixed_fee,
        effective_rate: rate.effective_rate,
        model: rate.model,
        tier: rate.tier,
        period_volume: periodVolume,
        config_id: rate.config_id,
        config_version: rate.config_version,
        config_source: schedule.source,
        used_override: rate.usedOverride,
        source: 'gateway_schedule',
      },
    };
  }

  const rate = resolve(config?.transaction_fee_percentage, globals?.default_transaction_fee, 2.5);
  return {
    amount: amount * (rate / 100),
    type: 'transaction_fee',
    metadata: { rate, source: 'payment_facilitator' },
  };
}
