import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  property_id: string;
  policy_ids: string[];
  days?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.property_id || !Array.isArray(body?.policy_ids)) {
      return new Response(JSON.stringify({ error: "property_id and policy_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const days = Math.max(1, Math.min(365, body.days ?? 90));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Gather rate-plan → policy map for this property.
    const { data: links } = await supabase
      .from("rolos_policy_rate_links")
      .select("policy_id, rate_plan_id")
      .in("policy_id", body.policy_ids);

    const ratePlanToPolicy = new Map<string, string>();
    for (const l of links ?? []) {
      if (l.rate_plan_id) ratePlanToPolicy.set(l.rate_plan_id, l.policy_id);
    }

    // 2. Default policy fallback.
    const { data: defaultRow } = await supabase
      .from("rolos_reservation_policies")
      .select("id")
      .eq("property_id", body.property_id)
      .eq("is_default", true)
      .maybeSingle();
    const defaultPolicyId = defaultRow?.id ?? null;

    // 3. Pull recent bookings for this property.
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, total_price, status, cancelled_at, check_in_date, check_out_date, rate_plan_id, created_at")
      .eq("property_id", body.property_id)
      .gte("created_at", since);

    const stats: Record<string, { room_nights: number; revenue: number; total: number; cancelled: number }> = {};
    for (const pid of body.policy_ids) stats[pid] = { room_nights: 0, revenue: 0, total: 0, cancelled: 0 };

    for (const b of bookings ?? []) {
      const rp = (b as { rate_plan_id?: string | null }).rate_plan_id;
      const pid = (rp && ratePlanToPolicy.get(rp)) || defaultPolicyId;
      if (!pid || !stats[pid]) continue;
      const ci = new Date(b.check_in_date as string);
      const co = new Date(b.check_out_date as string);
      const nights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / (24 * 3600 * 1000)));
      stats[pid].total += 1;
      stats[pid].room_nights += nights;
      stats[pid].revenue += Number(b.total_price ?? 0);
      const status = String(b.status ?? "").toLowerCase();
      if (status.includes("cancel") || b.cancelled_at) stats[pid].cancelled += 1;
    }

    const result = Object.entries(stats).map(([policy_id, s]) => ({
      policy_id,
      room_nights: s.room_nights,
      revenue: Number(s.revenue.toFixed(2)),
      cancel_rate: s.total > 0 ? Number(((s.cancelled / s.total) * 100).toFixed(1)) : 0,
      total_bookings: s.total,
      days,
    }));

    return new Response(JSON.stringify({ metrics: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
