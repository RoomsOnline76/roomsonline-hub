import { createClient } from "npm:@supabase/supabase-js@2";
import { ALL_REVENUE_PAYMENT_STATUSES, isRevenuePaymentStatus } from "../_shared/revenueStatuses.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "dev", "fearless_leader"]);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Access denied." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { action, dateRange, showYoY } = await req.json();
    const startDate = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];

    if (action === "get_rol_pulse") {
      // Revenue is recognised when the booking is taken, not when the guest arrives,
      // so the window filters on created_at (matching Payments and the payout hook).
      const createdFrom = `${startDate}T00:00:00.000Z`;
      const createdToDate = new Date(`${endDate}T00:00:00.000Z`);
      createdToDate.setUTCDate(createdToDate.getUTCDate() + 1);

      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id, total_price, calculated_commission, commission_rate_applied, commission_type,
          check_in_date, check_out_date, status, payment_status, booking_channel,
          integration_type, source_url, created_at, property_id,
          properties!bookings_property_id_fkey ( id, name )
        `)
        .gte("created_at", createdFrom)
        .lt("created_at", createdToDate.toISOString())
        .in("status", ["confirmed", "completed"])
        .in("payment_status", ALL_REVENUE_PAYMENT_STATUSES);

      if (bookingsError) throw bookingsError;

      // Deduplicate itinerary bookings
      const seenPairs = new Set<string>();
      const deduped = (bookings || []).filter(b => {
        const itId = (b as any).ai_metadata?.itinerary_id;
        if (itId && b.booking_channel === 'rol_itinerary') {
          const key = `${itId}:${b.property_id}`;
          if (seenPairs.has(key)) return false;
          seenPairs.add(key);
        }
        return true;
      });

      const paidBookings = deduped.filter(b => isRevenuePaymentStatus(b.payment_status, false));

      // Commission fallback: many bookings never had calculated_commission written,
      // so resolve the rate from commercial terms / billing config / globals.
      const propertyIds = Array.from(new Set(paidBookings.map(b => b.property_id).filter(Boolean)));
      const [propCfgRes, memberRes, termsRes, globalsRes] = await Promise.all([
        propertyIds.length
          ? supabase.from("property_billing_configs")
              .select("property_id, billing_strategy, commission_rate, listing_commission_rate, pms_commission_rate, widget_flat_commission_rate")
              .in("property_id", propertyIds)
          : Promise.resolve({ data: [] as any[] }),
        propertyIds.length
          ? supabase.from("property_portfolio_members").select("property_id, portfolio_id").in("property_id", propertyIds)
          : Promise.resolve({ data: [] as any[] }),
        propertyIds.length
          ? supabase.from("property_commercial_terms")
              .select("property_id, revenue_share_percent, commission_type, contract_status, effective_from, effective_to")
              .in("property_id", propertyIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("billing_global_defaults")
          .select("strategy, default_commission_rate, listing_commission_rate, pms_commission_rate, widget_flat_commission_rate"),
      ]);

      const portfolioIds = Array.from(new Set(((memberRes.data as any[]) || []).map(m => m.portfolio_id).filter(Boolean)));
      const portCfgRes = portfolioIds.length
        ? await supabase.from("portfolio_billing_configs")
            .select("portfolio_id, billing_strategy, commission_rate, listing_commission_rate, pms_commission_rate, widget_flat_commission_rate")
            .in("portfolio_id", portfolioIds)
        : { data: [] as any[] };

      const propCfg = new Map(((propCfgRes.data as any[]) || []).map(r => [r.property_id, r]));
      const portOf = new Map(((memberRes.data as any[]) || []).map(m => [m.property_id, m.portfolio_id]));
      const portCfg = new Map(((portCfgRes.data as any[]) || []).map(r => [r.portfolio_id, r]));
      const globalRows = (globalsRes.data as any[]) || [];

      const configFor = (propertyId: string) => {
        const pid = portOf.get(propertyId);
        return (pid && portCfg.get(pid)) || propCfg.get(propertyId) || null;
      };
      const termFor = (propertyId: string, type: string): number | null => {
        const rows = ((termsRes.data as any[]) || []).filter(t =>
          t.property_id === propertyId &&
          String(t.contract_status || "").toLowerCase() === "active" &&
          (t.commission_type ? String(t.commission_type) === type : true),
        );
        const rate = rows.length ? Number(rows[0].revenue_share_percent) : NaN;
        return Number.isFinite(rate) ? rate : null;
      };

      const commissionOf = (b: any): number => {
        const cfg = configFor(b.property_id);
        const globals = pickGlobals(globalRows, cfg?.billing_strategy);
        const type = resolveCommissionType(b);
        return resolveBookingCommission(b, Number(b.total_price) || 0, cfg, globals, termFor(b.property_id, type)).amount;
      };

      const commissionById = new Map<string, number>(paidBookings.map(b => [b.id as string, commissionOf(b)]));
      const commissionTypeById = new Map<string, string>(paidBookings.map(b => [b.id as string, resolveCommissionType(b)]));
      const comm = (b: any) => commissionById.get(b.id as string) || 0;

      const gbv = paidBookings.reduce((s, b) => s + (b.total_price || 0), 0);
      const rolRevenue = paidBookings.reduce((s, b) => s + comm(b), 0);
      const avgCommissionRate = gbv > 0 ? (rolRevenue / gbv) * 100 : 10;
      const netBookings = paidBookings.length;

      // Split revenue by commission type
      const listingRevenue = paidBookings
        .filter(b => commissionTypeById.get(b.id as string) === 'listing')
        .reduce((s, b) => s + comm(b), 0);
      const pmsRevenue = paidBookings
        .filter(b => commissionTypeById.get(b.id as string) === 'pms')
        .reduce((s, b) => s + comm(b), 0);

      // Channel breakdown
      const channelBreakdown: Record<string, { gbv: number; commission: number; count: number }> = {};
      paidBookings.forEach(b => {
        const channel = b.booking_channel || "Direct";
        if (!channelBreakdown[channel]) channelBreakdown[channel] = { gbv: 0, commission: 0, count: 0 };
        channelBreakdown[channel].gbv += b.total_price || 0;
        channelBreakdown[channel].commission += comm(b);
        channelBreakdown[channel].count += 1;
      });

      // Top properties
      const propBreakdown: Record<string, { name: string; gbv: number; commission: number; count: number; commissionType: string }> = {};
      paidBookings.forEach(b => {
        const pid = b.property_id;
        if (!propBreakdown[pid]) {
          propBreakdown[pid] = { name: b.properties?.name || "Unknown", gbv: 0, commission: 0, count: 0, commissionType: commissionTypeById.get(b.id as string) || 'listing' };
        }
        propBreakdown[pid].gbv += b.total_price || 0;
        propBreakdown[pid].commission += comm(b);
        propBreakdown[pid].count += 1;
      });

      const topProperties = Object.entries(propBreakdown)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 10);

      // Timeline — grouped by the month the booking was taken.
      const timelineData: Record<string, { date: string; gbv: number; commission: number; count: number }> = {};
      paidBookings.forEach(b => {
        const date = String(b.created_at || "").slice(0, 7) || "unknown";
        if (!timelineData[date]) timelineData[date] = { date, gbv: 0, commission: 0, count: 0 };
        timelineData[date].gbv += b.total_price || 0;
        timelineData[date].commission += comm(b);
        timelineData[date].count += 1;
      });
      const timeline = Object.values(timelineData).sort((a, b) => a.date.localeCompare(b.date));


      // Risk indicators
      const allBookings = bookings || [];
      const cancelledBookings = allBookings.filter(b => b.status === "cancelled");
      const cancellationRate = allBookings.length > 0 ? (cancelledBookings.length / allBookings.length) * 100 : 0;

      const { data: syncErrors } = await supabase
        .from("booking_sync_status").select("id").eq("sync_status", "failed").gte("created_at", startDate);

      const avgPropertyCommission = topProperties.length > 0
        ? topProperties.reduce((sum, p) => sum + p.commission, 0) / topProperties.length : 0;
      const lowPerformers = Object.values(propBreakdown)
        .filter(p => p.commission < avgPropertyCommission * 0.5).length;

      return new Response(
        JSON.stringify({
          tier1: {
            gbv,
            rolRevenue,
            listingRevenue,
            pmsRevenue,
            avgCommissionRate: Math.round(avgCommissionRate * 100) / 100,
            netBookings,
          },
          tier2: {
            channelBreakdown: Object.entries(channelBreakdown).map(([channel, data]) => ({ channel, ...data })),
            topProperties,
          },
          tier3: {
            cancellationRate: Math.round(cancellationRate * 100) / 100,
            syncFailureCount: syncErrors?.length || 0,
            lowPerformingProperties: lowPerformers,
          },
          timeline,
          dateRange: { start: startDate, end: endDate },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("Revenue Pulse API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
