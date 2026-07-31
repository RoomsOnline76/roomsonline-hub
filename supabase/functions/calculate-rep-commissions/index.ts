import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // first day of previous month
    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];
    const periodMonth = periodStartStr.substring(0, 7) + "-01"; // YYYY-MM-01

    // Get global defaults
    const { data: defaults } = await supabase
      .from("billing_global_defaults")
      .select("referral_first_year_rate, referral_residual_rate, referral_residual_months, referral_clawback_days")
      .eq("strategy", "default")
      .single();

    const firstYearRate = defaults?.referral_first_year_rate ?? 20;
    const residualRate = defaults?.referral_residual_rate ?? 5;
    const residualMonths = defaults?.referral_residual_months ?? 12;
    const clawbackDays = defaults?.referral_clawback_days ?? 90;

    // Tier rate overrides
    const tierRates: Record<string, { firstYear: number; residual: number; residualMonths: number }> = {
      base: { firstYear: firstYearRate, residual: residualRate, residualMonths },
      accelerated: { firstYear: 25, residual: 7.5, residualMonths: 18 },
      elite: { firstYear: 30, residual: 10, residualMonths: 24 },
    };

    // Get all converted referrals with active reps
    const { data: referrals, error: refError } = await supabase
      .from("property_referrals")
      .select("id, property_id, rep_id, referral_date, clawback_until, status")
      .eq("status", "converted");

    if (refError) throw refError;
    if (!referrals || referrals.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No converted referrals" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get rep tiers
    const repIds = [...new Set(referrals.map((r) => r.rep_id))];
    const { data: reps } = await supabase
      .from("sales_reps")
      .select("id, commission_tier, is_active")
      .in("id", repIds);

    const repMap = new Map((reps || []).map((r) => [r.id, r]));

    let processed = 0;
    const reportAgg: Record<string, { totalEntries: number; totalAmount: number }> = {};

    for (const referral of referrals) {
      const rep = repMap.get(referral.rep_id);
      if (!rep || !rep.is_active) continue;

      // Check clawback — if property churned within clawback period
      if (referral.clawback_until && new Date(referral.clawback_until) > periodEnd) {
        // Still in clawback window — check if property is still active
        // For now, we trust the status field
      }

      // Calculate months since referral
      const referralDate = new Date(referral.referral_date);
      const monthsSinceReferral = (periodStart.getFullYear() - referralDate.getFullYear()) * 12 +
        (periodStart.getMonth() - referralDate.getMonth());

      const tier = tierRates[rep.commission_tier] || tierRates.base;
      const isFirstYear = monthsSinceReferral < 12;
      const isWithinResidual = monthsSinceReferral < tier.residualMonths;

      if (!isFirstYear && !isWithinResidual) continue; // Past residual window

      const commissionType = isFirstYear ? "first_year" : "residual";
      const rate = isFirstYear ? tier.firstYear : tier.residual;

      // Get platform revenue for this property in the period (from billing_transactions).
      // Reps do NOT earn on facilitator surcharge (pass-through payment fee) or BYO gateway add-ons.
      const { data: transactions } = await supabase
        .from("billing_transactions")
        .select("amount, type")
        .eq("property_id", referral.property_id)
        .not("type", "in", "(transaction_fee,byo_gateway_fee,facilitator_surcharge)")
        .gte("created_at", periodStartStr)
        .lte("created_at", periodEndStr + "T23:59:59Z");

      const baseRevenue = (transactions || []).reduce((sum, t) => sum + (t.amount || 0), 0);

      if (baseRevenue <= 0) continue;

      const amount = baseRevenue * (rate / 100);

      // Check for duplicate entry
      const { data: existing } = await supabase
        .from("rep_commission_entries")
        .select("id")
        .eq("rep_id", referral.rep_id)
        .eq("property_id", referral.property_id)
        .eq("period_start", periodStartStr)
        .limit(1);

      if (existing && existing.length > 0) continue; // Already calculated

      await supabase.from("rep_commission_entries").insert({
        rep_id: referral.rep_id,
        property_id: referral.property_id,
        referral_id: referral.id,
        period_start: periodStartStr,
        period_end: periodEndStr,
        base_revenue: baseRevenue,
        commission_type: commissionType,
        rate_applied: rate,
        amount,
        status: "pending",
      });

      if (!reportAgg[referral.rep_id]) {
        reportAgg[referral.rep_id] = { totalEntries: 0, totalAmount: 0 };
      }
      reportAgg[referral.rep_id].totalEntries++;
      reportAgg[referral.rep_id].totalAmount += amount;
      processed++;
    }

    // Create/update monthly reports
    for (const [repId, agg] of Object.entries(reportAgg)) {
      const { data: existingReport } = await supabase
        .from("rep_commission_reports")
        .select("id")
        .eq("rep_id", repId)
        .eq("period_month", periodMonth)
        .limit(1);

      if (existingReport && existingReport.length > 0) {
        await supabase
          .from("rep_commission_reports")
          .update({
            total_entries: agg.totalEntries,
            total_amount: agg.totalAmount,
            status: "pending_approval",
            generated_at: new Date().toISOString(),
          })
          .eq("id", existingReport[0].id);
      } else {
        await supabase.from("rep_commission_reports").insert({
          rep_id: repId,
          period_month: periodMonth,
          total_entries: agg.totalEntries,
          total_amount: agg.totalAmount,
          status: "pending_approval",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, reports: Object.keys(reportAgg).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Commission calculation error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
