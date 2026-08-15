import { AI_MODELS, AI_GATEWAY_URL, aiFetch } from "../_shared/aiModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `You are the ROL Revenue Pulse analyst, an expert in hospitality revenue management, commission tracking, and conversion optimisation for Rooms Online (ROL).

Your role is to analyze revenue data and provide actionable financial insights. You have access to:
- GBV (Gross Booking Value): Total revenue from bookings
- ROL Revenue: Commission earned (typically 10% of GBV)
- Channel breakdown: Revenue by booking source (direct, OTA, etc.)
- Top properties: Highest revenue-generating properties
- Risk indicators: Cancellation rates, sync failures, underperforming properties
- Conversion funnel: Booking intent sessions vs actual bookings (NightsBridge widget data)
- Sync health: PMS connectivity status across the portfolio

Guidelines:
- Be concise and action-oriented — use markdown formatting (bold, bullets, line breaks)
- Focus on trends, anomalies, and opportunities
- Provide specific recommendations when possible
- Use ZAR currency format for South African context
- Highlight any concerning patterns in risk indicators
- Compare Y-on-Y performance when that data is provided
- When conversion data is available, analyze intent-to-booking conversion rates and identify drop-off points
- When sync health data is present, correlate connectivity issues with revenue gaps
- Structure responses with clear headings and bullet points for readability`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, context } = await req.json();
    const XAI_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!XAI_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context-aware message
    let contextMessage = "";
    if (context) {
      const { tier1, tier2, tier3, timeline, dateRange, showYoY, conversionData, syncHealth } = context;
      
      if (tier1) {
        contextMessage += `\n\nCurrent KPIs (${dateRange?.start} to ${dateRange?.end}):
- GBV: R${tier1.gbv?.toLocaleString() || 0}
- ROL Revenue: R${tier1.rolRevenue?.toLocaleString() || 0}
- Avg Commission Rate: ${tier1.avgCommissionRate?.toFixed(1) || 0}%
- Net Bookings: ${tier1.netBookings || 0}`;
      }

      if (tier2?.channelBreakdown?.length > 0) {
        contextMessage += `\n\nChannel Breakdown:`;
        tier2.channelBreakdown.forEach((ch: any) => {
          contextMessage += `\n- ${ch.channel}: R${ch.revenue?.toLocaleString()} (${ch.bookings} bookings)`;
        });
      }

      if (tier2?.topProperties?.length > 0) {
        contextMessage += `\n\nTop Properties:`;
        tier2.topProperties.slice(0, 5).forEach((p: any, i: number) => {
          contextMessage += `\n${i + 1}. ${p.name}: R${p.commission?.toLocaleString()} commission`;
        });
      }

      if (tier3) {
        contextMessage += `\n\nRisk Indicators:
- Cancellation Rate: ${tier3.cancellationRate?.toFixed(1) || 0}%
- Sync Failures: ${tier3.syncFailureCount || 0}
- Low Performing Properties: ${tier3.lowPerformingProperties || 0}`;
      }

      if (conversionData) {
        contextMessage += `\n\nConversion Funnel (NightsBridge Sessions):
- Total Sessions This Month: ${conversionData.totalThisMonth || 0}
- Matched (Converted): ${conversionData.matchedThisMonth || 0}
- Pending: ${conversionData.pendingThisMonth || 0}
- Expired (Dropped Off): ${conversionData.expiredThisMonth || 0}
- Month-on-Month Change: ${conversionData.momChange?.toFixed(1) || 0}%`;
        if (conversionData.conversionRate != null) {
          contextMessage += `\n- Conversion Rate: ${conversionData.conversionRate.toFixed(1)}%`;
        }
      }

      if (syncHealth) {
        contextMessage += `\n\nSync Health:
- Total Properties: ${syncHealth.totalProperties || 0}
- Connected (Active Sync): ${syncHealth.connectedCount || 0}
- Sync Errors: ${syncHealth.errorCount || 0}
- Last Failure: ${syncHealth.lastFailure || 'None'}`;
      }

      if (showYoY) {
        contextMessage += `\n\nY-on-Y comparison is enabled.`;
      }
    }

    const response = await aiFetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODELS.revenue_insights,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${prompt}${contextMessage}` },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "TOBI is temporarily unavailable — credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("xAI API error:", response.status, errorText);
      throw new Error(`TOBI service error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const insight = aiResponse.choices?.[0]?.message?.content || "Unable to generate insight.";

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Revenue pulse insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
