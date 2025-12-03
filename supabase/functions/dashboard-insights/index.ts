import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, dashboardData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing dashboard insights request:", { prompt, dataKeys: Object.keys(dashboardData || {}) });

    const systemPrompt = `You are a hospitality analytics expert analyzing booking and revenue data for a hotel/property management system. 
Your role is to provide concise, actionable insights based on the data provided.

Guidelines:
- Be extremely concise - max 2-3 sentences
- Focus on the most impactful insight
- Use specific numbers and percentages
- Highlight trends, anomalies, or opportunities
- Format currency as ZAR (R)
- If asked about forecasts, explain trends
- Identify top drivers and key patterns

Example outputs:
- "Top driver: December bookings peaked at +25% vs November, driven by holiday demand."
- "Revenue gap: Weekday occupancy (42%) trails weekends (78%) - consider corporate rates."
- "Alert: Cancellations up 15% this month - review booking policies."`;

    const userPrompt = `Here is the current dashboard data:

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
).join('\n') || 'No breakdown'}

User Question: ${prompt}

Provide a concise analytical insight addressing the user's question.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
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
