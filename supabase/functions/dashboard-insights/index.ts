import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(500, "Prompt too long"),
  dashboardData: z.record(z.any()),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { prompt, dashboardData } = validationResult.data;
    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
    
    if (!XAI_API_KEY) {
      throw new Error("XAI_API_KEY is not configured");
    }

    console.log("Processing dashboard insights request:", { prompt, dataKeys: Object.keys(dashboardData || {}) });

    const systemPrompt = `You are a hospitality analytics expert analyzing booking and revenue data for a hotel/property management system.
Your role is to provide concise, actionable insights based on the data provided.

Guidelines:
- Be concise — max 3-4 sentences, use markdown formatting (bold, bullets)
- Focus on the most impactful insight
- Use specific numbers and percentages
- Highlight trends, anomalies, or opportunities
- Format currency as ZAR (R)
- If asked about forecasts, explain trends
- Identify top drivers and key patterns
- When conversion/session data is available, analyse booking intent vs actual conversions
- When PMS distribution data is provided, note integration health patterns
- When sync status is available, flag properties with connectivity issues that may affect revenue

Example outputs:
- "**Top driver:** December bookings peaked at +25% vs November, driven by holiday demand."
- "**Revenue gap:** Weekday occupancy (42%) trails weekends (78%) — consider corporate rates."
- "**Conversion alert:** Only 34% of booking intents converted this month — investigate drop-off on top 3 properties."`;

    let userPrompt = `Here is the current dashboard data:

Stats:
- Total Bookings: ${dashboardData.stats?.totalBookings || 0}
- Confirmed: ${dashboardData.stats?.confirmedBookings || 0}
- Cancelled: ${dashboardData.stats?.cancelledBookings || 0}
- Total Revenue: R ${dashboardData.stats?.totalRevenue?.toLocaleString() || 0}
- ADR (Avg Daily Rate): R ${dashboardData.stats?.adr?.toFixed(0) || 0}
- RevPAR: R ${dashboardData.stats?.revpar?.toFixed(0) || 0}
- Occupancy: ${dashboardData.stats?.occupancy?.toFixed(1) || 0}%
- Booked Nights: ${dashboardData.stats?.bookedNights || 0}
- Available Nights: ${dashboardData.stats?.availableNights || 0}
- Properties: ${dashboardData.stats?.totalProperties || 0}
- Total Rooms: ${dashboardData.stats?.totalRooms || 0}
- Days in Period: ${dashboardData.stats?.daysInPeriod || 0}

Y-o-Y Changes:
- Bookings: ${dashboardData.stats?.yoyBookings?.toFixed(1) || 0}%
- Revenue: ${dashboardData.stats?.yoyRevenue?.toFixed(1) || 0}%
- ADR: ${dashboardData.stats?.yoyAdr?.toFixed(1) || 0}%
- RevPAR: ${dashboardData.stats?.yoyRevpar?.toFixed(1) || 0}%
- Occupancy: ${dashboardData.stats?.yoyOccupancy?.toFixed(1) || 0}pp

Chart Data (last ${dashboardData.chartData?.length || 0} periods):
${dashboardData.chartData?.slice(-12).map((d: any) => 
  `${d.label}: ${d.bookings} bookings, R${d.revenue} revenue${d.isDataGap ? ' (gap)' : ''}${d.isInterpolated ? ' (interpolated)' : ''}`
).join('\n') || 'No chart data'}

Property Breakdown:
${dashboardData.propertyBreakdown?.slice(0, 5).map((p: any) => 
  `${p.name}: ${p.bookings} bookings, R${p.revenue.toLocaleString()}`
).join('\n') || 'No breakdown'}`;

    // Add conversion data if available
    if (dashboardData.conversionData) {
      const cd = dashboardData.conversionData;
      userPrompt += `\n\nConversion Funnel (NightsBridge Sessions):
- Total Sessions This Month: ${cd.totalThisMonth || 0}
- Matched (Converted): ${cd.matchedThisMonth || 0}
- Pending: ${cd.pendingThisMonth || 0}
- Expired (Dropped Off): ${cd.expiredThisMonth || 0}
- Month-on-Month Change: ${cd.momChange?.toFixed(1) || 0}%`;
      if (cd.conversionRate != null) {
        userPrompt += `\n- Conversion Rate: ${cd.conversionRate.toFixed(1)}%`;
      }
    }

    // Add PMS distribution if available
    if (dashboardData.pmsDistribution) {
      userPrompt += `\n\nPMS Distribution:`;
      Object.entries(dashboardData.pmsDistribution).forEach(([pms, count]) => {
        userPrompt += `\n- ${pms}: ${count} properties`;
      });
    }

    userPrompt += `\n\nUser Question: ${prompt}\n\nProvide a concise analytical insight addressing the user's question. Use markdown formatting.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini-fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("xAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`TOBI service error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content || "Unable to generate insight.";
    
    console.log("Generated insight:", insight);

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Dashboard insights error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
