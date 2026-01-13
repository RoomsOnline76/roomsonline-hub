import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Verify user has admin/dev role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin/dev role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "dev"]);

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Access denied. Admin or dev role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, dateRange } = await req.json();
    const startDate = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = dateRange?.end || new Date().toISOString().split('T')[0];

    if (action === "get_rol_pulse") {
      // Fetch all confirmed/paid bookings in date range
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          total_price,
          calculated_commission,
          commission_rate_applied,
          check_in_date,
          check_out_date,
          status,
          payment_status,
          booking_channel,
          created_at,
          property_id,
          properties (
            id,
            name,
            pms_system
          )
        `)
        .gte("check_in_date", startDate)
        .lte("check_in_date", endDate)
        .in("status", ["confirmed", "completed"]);

      if (bookingsError) throw bookingsError;

      // Calculate Tier 1 KPIs
      const paidBookings = (bookings || []).filter(b => b.payment_status === "paid");
      const gbv = paidBookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
      const rolRevenue = paidBookings.reduce((sum, b) => sum + (b.calculated_commission || 0), 0);
      const avgCommissionRate = gbv > 0 ? (rolRevenue / gbv) * 100 : 10;
      const netBookings = paidBookings.length;

      // Calculate Tier 2: Channel breakdown
      const channelBreakdown: Record<string, { gbv: number; commission: number; count: number }> = {};
      paidBookings.forEach(b => {
        const channel = b.properties?.pms_system || b.booking_channel || "Direct";
        if (!channelBreakdown[channel]) {
          channelBreakdown[channel] = { gbv: 0, commission: 0, count: 0 };
        }
        channelBreakdown[channel].gbv += b.total_price || 0;
        channelBreakdown[channel].commission += b.calculated_commission || 0;
        channelBreakdown[channel].count += 1;
      });

      // Calculate Tier 2: Top properties
      const propertyBreakdown: Record<string, { 
        name: string; 
        gbv: number; 
        commission: number; 
        count: number 
      }> = {};
      paidBookings.forEach(b => {
        const propId = b.property_id;
        if (!propertyBreakdown[propId]) {
          propertyBreakdown[propId] = { 
            name: b.properties?.name || "Unknown", 
            gbv: 0, 
            commission: 0, 
            count: 0 
          };
        }
        propertyBreakdown[propId].gbv += b.total_price || 0;
        propertyBreakdown[propId].commission += b.calculated_commission || 0;
        propertyBreakdown[propId].count += 1;
      });

      const topProperties = Object.entries(propertyBreakdown)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 10);

      // Calculate timeline data (daily/monthly aggregation)
      const timelineData: Record<string, { date: string; gbv: number; commission: number; count: number }> = {};
      paidBookings.forEach(b => {
        const date = b.check_in_date?.slice(0, 7) || "unknown"; // Monthly aggregation
        if (!timelineData[date]) {
          timelineData[date] = { date, gbv: 0, commission: 0, count: 0 };
        }
        timelineData[date].gbv += b.total_price || 0;
        timelineData[date].commission += b.calculated_commission || 0;
        timelineData[date].count += 1;
      });

      const timeline = Object.values(timelineData).sort((a, b) => a.date.localeCompare(b.date));

      // Calculate Tier 3: Risk indicators
      const allBookings = bookings || [];
      const cancelledBookings = allBookings.filter(b => b.status === "cancelled");
      const cancellationRate = allBookings.length > 0 
        ? (cancelledBookings.length / allBookings.length) * 100 
        : 0;

      // Fetch sync failures from recent period
      const { data: syncErrors } = await supabase
        .from("booking_sync_status")
        .select("id")
        .eq("sync_status", "failed")
        .gte("created_at", startDate);
      
      const syncFailureCount = syncErrors?.length || 0;

      // Properties with low commission (under 5% of avg)
      const avgPropertyCommission = topProperties.length > 0
        ? topProperties.reduce((sum, p) => sum + p.commission, 0) / topProperties.length
        : 0;
      const lowPerformers = Object.values(propertyBreakdown)
        .filter(p => p.commission < avgPropertyCommission * 0.5)
        .length;

      return new Response(
        JSON.stringify({
          tier1: {
            gbv,
            rolRevenue,
            avgCommissionRate: Math.round(avgCommissionRate * 100) / 100,
            netBookings,
          },
          tier2: {
            channelBreakdown: Object.entries(channelBreakdown).map(([channel, data]) => ({
              channel,
              ...data,
            })),
            topProperties,
          },
          tier3: {
            cancellationRate: Math.round(cancellationRate * 100) / 100,
            syncFailureCount,
            lowPerformingProperties: lowPerformers,
          },
          timeline,
          dateRange: { start: startDate, end: endDate },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Revenue Pulse API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
