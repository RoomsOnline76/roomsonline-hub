import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Calculate period (previous month)
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of prev month

    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];

    // Get all distinct owners with billing transactions in this period
    const { data: transactions, error: txError } = await supabase
      .from("billing_transactions")
      .select("owner_id, type, amount")
      .gte("created_at", periodStartStr)
      .lte("created_at", periodEndStr + 'T23:59:59Z')
      .not("owner_id", "is", null);

    if (txError) throw txError;

    // Group by owner
    const ownerTotals: Record<string, { commission: number; fees: number }> = {};
    for (const tx of (transactions || [])) {
      if (!tx.owner_id) continue;
      if (!ownerTotals[tx.owner_id]) {
        ownerTotals[tx.owner_id] = { commission: 0, fees: 0 };
      }
      if (tx.type === 'commission') {
        ownerTotals[tx.owner_id].commission += Number(tx.amount);
      } else {
        ownerTotals[tx.owner_id].fees += Number(tx.amount);
      }
    }

    let invoicesCreated = 0;

    for (const [ownerId, totals] of Object.entries(ownerTotals)) {
      // Check if invoice already exists for this period
      const { data: existing } = await supabase
        .from("owner_invoices")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("period_start", periodStartStr)
        .eq("period_end", periodEndStr)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const netPayout = totals.commission + totals.fees;

      const { error: insertError } = await supabase
        .from("owner_invoices")
        .insert({
          owner_id: ownerId,
          period_start: periodStartStr,
          period_end: periodEndStr,
          total_commission: totals.commission,
          total_fees: totals.fees,
          net_payout: netPayout,
          status: 'draft',
        });

      if (insertError) {
        console.error(`Failed to create invoice for owner ${ownerId}:`, insertError);
        continue;
      }

      invoicesCreated++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: { start: periodStartStr, end: periodEndStr },
        owners_processed: Object.keys(ownerTotals).length,
        invoices_created: invoicesCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Invoice generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
