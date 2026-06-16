// Generates monthly portfolio share invoices by aggregating pending attributions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  portfolio_id?: string;
  period_start?: string; // YYYY-MM-DD
  period_end?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body: Body = await req.json().catch(() => ({}));

    // Default = previous calendar month
    const now = new Date();
    const start = body.period_start
      ? new Date(body.period_start)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = body.period_end
      ? new Date(body.period_end)
      : new Date(now.getFullYear(), now.getMonth(), 0);
    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);

    let q = supabase
      .from("booking_revenue_attributions")
      .select("*")
      .eq("status", "pending")
      .gte("created_at", `${periodStart}T00:00:00Z`)
      .lte("created_at", `${periodEnd}T23:59:59Z`);
    if (body.portfolio_id) q = q.eq("portfolio_id", body.portfolio_id);

    const { data: attrs, error: attrErr } = await q;
    if (attrErr) throw attrErr;

    // Group by portfolio + from + to + currency
    type Group = { portfolio_id: string; from_property_id: string; to_property_id: string; currency: string; ids: string[]; total: number };
    const groups = new Map<string, Group>();
    for (const a of attrs ?? []) {
      const key = `${a.portfolio_id}|${a.from_property_id}|${a.to_property_id}|${a.currency}`;
      const g = groups.get(key) ?? {
        portfolio_id: a.portfolio_id,
        from_property_id: a.from_property_id,
        to_property_id: a.to_property_id,
        currency: a.currency,
        ids: [],
        total: 0,
      };
      g.ids.push(a.id);
      g.total += Number(a.share_amount);
      groups.set(key, g);
    }

    let created = 0;
    for (const g of groups.values()) {
      if (g.total <= 0) continue;
      const invoiceNumber = `PS-${periodStart.slice(0, 7)}-${g.from_property_id.slice(0, 4).toUpperCase()}-${g.to_property_id.slice(0, 4).toUpperCase()}`;
      const { data: inv, error: invErr } = await supabase
        .from("portfolio_share_invoices")
        .upsert({
          portfolio_id: g.portfolio_id,
          from_property_id: g.from_property_id,
          to_property_id: g.to_property_id,
          period_start: periodStart,
          period_end: periodEnd,
          subtotal: g.total,
          tax: 0,
          total: g.total,
          currency: g.currency,
          status: "draft",
          invoice_number: invoiceNumber,
        }, { onConflict: "portfolio_id,from_property_id,to_property_id,period_start" })
        .select("id")
        .single();
      if (invErr) throw invErr;

      await supabase
        .from("booking_revenue_attributions")
        .update({ status: "invoiced", invoice_id: inv.id })
        .in("id", g.ids);
      created++;
    }

    return new Response(JSON.stringify({ created, period_start: periodStart, period_end: periodEnd }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
